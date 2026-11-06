import type { MediaAsset, MediaType, MediaFileInfo } from "@/types/media"
import { useSettingsStore } from "@/stores/settings-store"

export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
]
export const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv"]
export const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  "wma",
]

/** `<input accept=…>` / dialog-friendly list of every supported extension. */
export const ALL_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/** Resolve a media kind from a file name or path, or `null` if unsupported. */
export function getMediaType(nameOrPath: string): MediaType | null {
  const ext = nameOrPath.split(".").pop()?.toLowerCase() ?? ""
  if (IMAGE_EXTENSIONS.includes(ext)) return "image"
  if (VIDEO_EXTENSIONS.includes(ext)) return "video"
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio"
  return null
}

function baseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path
}

let statFnPromise: Promise<
  ((p: string) => Promise<{ size: number }>) | null
> | null = null

function getStatFn() {
  if (!isTauri) return Promise.resolve(null)
  statFnPromise ??= import("@tauri-apps/plugin-fs")
    .then((fs) => fs.stat as (p: string) => Promise<{ size: number }>)
    .catch(() => null)
  return statFnPromise
}

/**
 * Copy imported paths into the app-managed library folder (import mode
 * "copy"). Returns managed assets built from the backend's returned paths, or
 * `null` if the backend command is unavailable (caller falls back to
 * referencing). Progress is reported as a single step since the copy happens in
 * one backend round-trip.
 */
async function copiedPathsToAssets(
  paths: string[],
  onProgress?: (current: number, total: number) => void
): Promise<MediaAsset[] | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const infos = await invoke<MediaFileInfo[]>("copy_media_to_library", {
      paths,
    })
    const assets = infos.map((info) => ({
      id: crypto.randomUUID(),
      name: info.name,
      type: info.mediaType,
      filePath: info.path,
      width: info.width,
      height: info.height,
      fileSize: info.size,
      tags: [],
      addedAt: Date.now(),
      managed: true,
    }))
    onProgress?.(paths.length, paths.length)
    return assets
  } catch {
    return null
  }
}

/**
 * Turn OS file paths (from a native drop or the file dialog) into media assets,
 * skipping unsupported types.
 *
 * In import mode "copy" (Tauri only) each file is copied into the app-managed
 * library folder and the asset points at that copy (`managed: true`). In the
 * default "reference" mode nothing is copied — the original path is stored and
 * sizes are filled in via `stat` when available.
 */
export async function pathsToAssets(
  paths: string[],
  onProgress?: (current: number, total: number) => void
): Promise<MediaAsset[]> {
  if (isTauri && useSettingsStore.getState().mediaImportMode === "copy") {
    const copied = await copiedPathsToAssets(paths, onProgress)
    if (copied) return copied
    // Backend copy unavailable — fall through to referencing the originals.
  }

  const statFn = await getStatFn()
  const assets: MediaAsset[] = []

  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i]
    const mediaType = getMediaType(filePath)
    if (mediaType) {
      let fileSize = 0
      if (statFn) {
        try {
          fileSize = (await statFn(filePath)).size
        } catch {
          /* size stays 0 */
        }
      }
      assets.push({
        id: crypto.randomUUID(),
        name: baseName(filePath),
        type: mediaType,
        filePath,
        fileSize,
        tags: [],
        addedAt: Date.now(),
      })
    }
    onProgress?.(i + 1, paths.length)
  }

  return assets
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Browser fallback: turn `File` objects (from an `<input>` or an HTML5 drop)
 * into media assets. Images get an inline data-URL thumbnail.
 */
export async function filesToAssets(
  files: File[] | FileList,
  onProgress?: (current: number, total: number) => void
): Promise<MediaAsset[]> {
  const arr = Array.from(files)
  const assets: MediaAsset[] = []

  for (let i = 0; i < arr.length; i++) {
    const file = arr[i]
    const mediaType = getMediaType(file.name)
    if (mediaType) {
      let thumbnailDataUrl: string | undefined
      if (mediaType === "image") {
        try {
          thumbnailDataUrl = await fileToDataUrl(file)
        } catch {
          /* no thumbnail */
        }
      }
      assets.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: mediaType,
        filePath: file.name,
        thumbnailDataUrl,
        fileSize: file.size,
        tags: [],
        addedAt: Date.now(),
      })
    }
    onProgress?.(i + 1, arr.length)
  }

  return assets
}
