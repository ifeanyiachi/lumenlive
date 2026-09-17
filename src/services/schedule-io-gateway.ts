/**
 * Schedule import/export gateway — the Tauri I/O boundary for reading and
 * writing schedule files off disk.
 *
 * All `@tauri-apps` access for the "save the running order to its own file /
 * import it back" feature lives here (per the services layer rule): the
 * save/open dialogs and text-file read/write. The pure serializer/parser in
 * `@/lib/schedule-io` never touches the filesystem — callers serialize, then
 * write through this gateway; or read here, then parse. Imports are dynamic so
 * the module is safe to load in the browser / tests, where the plugins are
 * absent.
 */

import { SCHEDULE_FILE_EXTENSION } from "@/lib/schedule-io"
import { i18n } from "@/lib/i18n/config"
import type { BundleManifest } from "@/lib/schedule-bundle"
import {
  saveBundle,
  readBundle,
  type BundleMediaFile,
  type ExtractedMedia,
} from "@/services/bundle-gateway"

/** Save dialog: always write the branded extension. */
function saveFilters() {
  return [
    {
      name: i18n.t("schedule:dialog.scheduleFile"),
      extensions: [SCHEDULE_FILE_EXTENSION],
    },
  ]
}

/**
 * Open dialog: accept the file whatever extension a transfer left it with.
 * A bundle's bytes are a zip, so email / messaging / cloud services routinely
 * rename `sunday.lumsched` to `sunday.zip` in transit — and some strip the
 * extension entirely. The Rust reader detects the real format from the file's
 * *content* (zip vs JSON), not its name, so the picker must not hide those
 * renamed files. `.lumsched`/`.zip`/`.json` lead the list; "All files" is the
 * fallback for anything else a transfer produced.
 */
function openFilters() {
  return [
    {
      name: i18n.t("schedule:dialog.scheduleFile"),
      extensions: [SCHEDULE_FILE_EXTENSION, "zip", "json"],
    },
    { name: i18n.t("schedule:dialog.allFiles"), extensions: ["*"] },
  ]
}

/**
 * Prompt for a save location (pre-filled with `defaultName`) and write
 * `contents` there. Returns the saved path, or null if the user cancels or the
 * plugins are unavailable (browser/tests).
 */
export async function saveScheduleFile(
  defaultName: string,
  contents: string
): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog")
    const { writeTextFile } = await import("@tauri-apps/plugin-fs")
    const path = await save({
      defaultPath: defaultName,
      filters: saveFilters(),
    })
    if (!path) return null
    await writeTextFile(path, contents)
    return path
  } catch {
    return null
  }
}

/**
 * Write a self-contained schedule bundle (a zip kept under the `.lumsched`
 * extension). Prompts for a save location, then hands the manifest + the list of
 * media files to embed to the Rust `write_bundle` command, which
 * streams the media bytes straight into the archive. Returns the saved path, or
 * null if the user cancels or the plugins are unavailable. A write failure
 * (disk full, permission) rejects so the caller can report it.
 */
export async function saveScheduleBundle(
  defaultName: string,
  manifest: BundleManifest,
  mediaFiles: BundleMediaFile[]
): Promise<string | null> {
  return saveBundle(
    defaultName,
    JSON.stringify(manifest),
    mediaFiles,
    saveFilters()
  )
}

/** A schedule file read off disk by {@link readScheduleFile}. */
export interface ReadScheduleFile {
  /** Basename including extension, e.g. "sunday-morning.lumsched". */
  name: string
  /** True when the file was a legacy plain-JSON export (route to the old parser). */
  legacy: boolean
  /** The bundle's manifest text, or (legacy) the whole file text. */
  manifestJson: string
  /** Media extracted into the managed library (empty for a legacy file). */
  media: ExtractedMedia[]
}

/**
 * Open the picker for a schedule file and read it through the Rust
 * `read_schedule_bundle` command, which auto-detects a zip bundle vs a legacy
 * plain-JSON export (unpacking bundle media into the managed library). Returns
 * null when the user cancels or the plugins are unavailable. Parsing/validation
 * is the caller's job (see `@/lib/schedule-bundle` / `@/lib/schedule-io`).
 */
export async function readScheduleFile(): Promise<ReadScheduleFile | null> {
  return readBundle(i18n.t("schedule:dialog.importSchedule"), openFilters())
}

/** A schedule file the user picked, with its raw text ready to parse. */
export interface PickedScheduleFile {
  /** Basename including extension, e.g. "sunday-morning.lumsched". */
  name: string
  text: string
}

/**
 * Open the file picker for a schedule file and read its text. Returns null when
 * the user cancels, when the file can't be read, or when the plugins are
 * unavailable. Parsing/validation is the caller's job (see `@/lib/schedule-io`).
 */
export async function pickScheduleFile(): Promise<PickedScheduleFile | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog")
    const { readTextFile } = await import("@tauri-apps/plugin-fs")
    const selected = await open({
      multiple: false,
      title: i18n.t("schedule:dialog.importSchedule"),
      filters: openFilters(),
    })
    if (selected == null || Array.isArray(selected)) return null
    const path = String(selected)
    const text = await readTextFile(path)
    return { name: path.split(/[\\/]/).pop() ?? "schedule", text }
  } catch {
    return null
  }
}
