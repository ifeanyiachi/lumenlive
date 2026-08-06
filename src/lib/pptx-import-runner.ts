import type { MediaFileInfo } from "@/types/media"
import { parsePptx, type ImageResolver } from "@/lib/pptx-import"
import { usePresentationStore } from "@/stores/presentation-store"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  svg: "image/svg+xml",
}

/**
 * Persist an extracted image and return a URL the Slide model can render.
 *
 * In Tauri the bytes are written into the app-managed media library (so they
 * survive restarts and don't bloat presentations.json) and the managed path is
 * converted to an asset URL. In the browser we fall back to an inline data URL.
 */
const resolveImage: ImageResolver = async (bytes, fileName) => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "png"
  if (isTauri) {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const info = await invoke<MediaFileInfo>("save_media_bytes", {
        fileName,
        dataBase64: bytesToBase64(bytes),
      })
      const { convertFileSrc } = await import("@tauri-apps/api/core")
      return convertFileSrc(info.path)
    } catch {
      // Fall through to a data URL if the backend command is unavailable.
    }
  }
  const mime = MIME_BY_EXT[ext] ?? "image/png"
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

/**
 * Parse a `.pptx` file into a new presentation and add it to the store.
 * Returns the new presentation's id. Throws on unreadable/invalid files.
 */
export async function importPptxFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const presentation = await parsePptx(buffer, file.name, resolveImage)
  return usePresentationStore.getState().importParsedPresentation(presentation)
}
