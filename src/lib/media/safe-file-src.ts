import { convertFileSrc } from "@tauri-apps/api/core"

/**
 * Convert a local file path to a webview-loadable asset URL, falling back to
 * the raw path if conversion throws (e.g. outside a Tauri context, or an
 * already-converted/remote URL). Callers embed the result directly in
 * `src`/`url` attributes, so this never rejects — it always returns a string.
 */
export function safeFileSrc(path: string): string {
  try {
    return convertFileSrc(path)
  } catch {
    return path
  }
}
