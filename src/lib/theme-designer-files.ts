import { open } from "@tauri-apps/plugin-dialog"
import { readFile } from "@tauri-apps/plugin-fs"

export interface PickedThemeImage {
  /** Base64 data URL, embedded into the theme so it persists across restarts. */
  url: string
  /** Absolute source path, for also registering the file in the media library. */
  path: string
}

/**
 * Opens a native file dialog to pick an image, reads it, and returns both a
 * base64 data URL (embedded into the theme so it persists across restarts) and
 * the source path (so callers can also register it in the media library).
 */
export async function pickThemeBackgroundImage(): Promise<PickedThemeImage | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"],
      },
    ],
  })
  if (!selected) return null

  const path = typeof selected === "string" ? selected : selected
  const bytes = await readFile(path)
  const extension = path.split(".").pop()?.toLowerCase() ?? "png"
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  }
  const mime = mimeMap[extension] ?? "image/png"

  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  const base64 = btoa(binary)
  return { url: `data:${mime};base64,${base64}`, path }
}

/**
 * Opens a native file dialog to pick a video file,
 * returns the absolute file path (videos are too large for base64 embedding).
 */
export async function pickImageFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
      },
    ],
  })
  if (!selected) return null
  return typeof selected === "string" ? selected : selected
}

export async function pickVideoFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Videos",
        extensions: ["mp4", "webm", "mov", "avi", "mkv", "m4v"],
      },
    ],
  })
  if (!selected) return null
  return typeof selected === "string" ? selected : selected
}

export async function pickMediaFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Media",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "webp",
          "gif",
          "bmp",
          "svg",
          "mp4",
          "webm",
          "mov",
          "avi",
          "mkv",
          "m4v",
        ],
      },
    ],
  })
  if (!selected) return null
  return typeof selected === "string" ? selected : selected
}

