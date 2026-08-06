/**
 * Song import gateway — the Tauri I/O boundary for reading song files off disk.
 *
 * All `@tauri-apps` access for song import lives here (per the services layer
 * rule): the file-open dialog and text-file reads. The pure parsers in
 * `@/lib/song/import` never touch the filesystem — callers read files through
 * this gateway, then parse the returned text. Imports are dynamic so the module
 * is safe to load in the browser / tests, where the plugins are absent.
 */

export interface PickedSongFile {
  /** Basename including extension, e.g. "amazing-grace.xml". Drives detection. */
  name: string
  text: string
}

/** A binary song file (currently `.qsp`/`.zip` packs). */
export interface PickedZipFile {
  name: string
  bytes: Uint8Array
}

/** Result of reading a folder: text songs and binary (ZIP) packs, bucketed. */
export interface FolderImportFiles {
  textFiles: PickedSongFile[]
  zipFiles: PickedZipFile[]
}

const ZIP_EXTENSIONS = ["qsp", "zip"]

function extOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? ""
}

function isSongFileName(name: string): boolean {
  const ext = extOf(name)
  return SONG_FILE_EXTENSIONS.includes(ext) || ZIP_EXTENSIONS.includes(ext)
}

/** File extensions offered in the import dialog (Phase 4: P0 + P1 formats). */
export const SONG_FILE_EXTENSIONS = [
  "xml",
  "txt",
  "cho",
  "chordpro",
  "chopro",
  "crd",
  "pro",
  "onsong",
  "sng",
  "usr",
  "pro4",
  "pro5",
  "pro6",
]

/**
 * Open the OS file picker for song files and read each selection's text.
 * Returns `[]` when the user cancels, when not running under Tauri, or when
 * every selected file fails to read. Unreadable individual files are skipped
 * rather than failing the whole batch.
 */
export async function pickAndReadSongFiles(): Promise<PickedSongFile[]> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const { readTextFile } = await import("@tauri-apps/plugin-fs")

    const selected = await open({
      multiple: true,
      title: "Import songs",
      filters: [{ name: "Song files", extensions: SONG_FILE_EXTENSIONS }],
    })
    if (selected == null) return []

    const paths = Array.isArray(selected) ? selected : [selected]
    const files: PickedSongFile[] = []
    for (const path of paths) {
      const p = String(path)
      try {
        const text = await readTextFile(p)
        files.push({ name: p.split(/[\\/]/).pop() ?? "song", text })
      } catch {
        // Skip a single unreadable file; keep importing the rest.
      }
    }
    return files
  } catch {
    // Plugins unavailable (browser/tests) or dialog failed — nothing to import.
    return []
  }
}

/**
 * Prompt the user for a folder, then read every song file under it (recursively)
 * into `text`/`bytes` buckets, reporting `read/total` progress as it goes. Text
 * formats become `PickedSongFile`s; `.qsp`/`.zip` packs become `PickedZipFile`s.
 * Returns null when the user cancels or the plugins are unavailable.
 */
export async function readSongFolder(
  onProgress: (read: number, total: number) => void
): Promise<FolderImportFiles | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const { readDir, readTextFile, readFile } =
      await import("@tauri-apps/plugin-fs")
    const { join } = await import("@tauri-apps/api/path")

    const dir = await open({
      directory: true,
      multiple: false,
      title: "Import songs from folder",
    })
    if (!dir || Array.isArray(dir)) return null

    // Recursively collect matching file paths.
    async function walk(current: string): Promise<string[]> {
      const found: string[] = []
      let entries
      try {
        entries = await readDir(current)
      } catch {
        return found
      }
      for (const entry of entries) {
        const full = await join(current, entry.name)
        if (entry.isDirectory) found.push(...(await walk(full)))
        else if (entry.isFile && isSongFileName(entry.name)) found.push(full)
      }
      return found
    }

    const paths = await walk(String(dir))
    const textFiles: PickedSongFile[] = []
    const zipFiles: PickedZipFile[] = []
    let read = 0
    for (const path of paths) {
      const name = path.split(/[\\/]/).pop() ?? "song"
      try {
        if (ZIP_EXTENSIONS.includes(extOf(name))) {
          zipFiles.push({ name, bytes: await readFile(path) })
        } else {
          textFiles.push({ name, text: await readTextFile(path) })
        }
      } catch {
        // Skip a single unreadable file; keep going.
      }
      read += 1
      onProgress(read, paths.length)
    }
    return { textFiles, zipFiles }
  } catch {
    return null
  }
}

/** Open the file picker for `.qsp`/`.zip` Quelea packs and read their bytes. */
export async function pickAndReadSongPacks(): Promise<PickedZipFile[]> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const { readFile } = await import("@tauri-apps/plugin-fs")
    const selected = await open({
      multiple: true,
      title: "Import Quelea packs",
      filters: [{ name: "Quelea pack", extensions: ZIP_EXTENSIONS }],
    })
    if (selected == null) return []
    const paths = Array.isArray(selected) ? selected : [selected]
    const packs: PickedZipFile[] = []
    for (const path of paths) {
      const p = String(path)
      try {
        packs.push({
          name: p.split(/[\\/]/).pop() ?? "pack.qsp",
          bytes: await readFile(p),
        })
      } catch {
        // Skip an unreadable pack.
      }
    }
    return packs
  } catch {
    return []
  }
}

/**
 * Prompt for a save location and write `contents` there. Returns the saved path,
 * or null if the user cancels or the plugins are unavailable. Used for OpenLyrics
 * export and the CCLI usage report.
 */
export async function saveTextFile(
  defaultName: string,
  contents: string
): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const { writeTextFile } = await import("@tauri-apps/plugin-fs")
    const path = await save({ defaultPath: defaultName })
    if (!path) return null
    await writeTextFile(path, contents)
    return path
  } catch {
    return null
  }
}
