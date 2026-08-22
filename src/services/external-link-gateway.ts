/**
 * Gateway for opening external URLs in the user's default browser. Uses a lazy
 * import so plain browser dev (no Tauri) falls back to `window.open` instead of
 * failing on a missing plugin.
 */

/**
 * Open `url` in the OS default browser. Under Tauri this hands off to the opener
 * plugin; in a plain browser it falls back to `window.open`. Silently no-ops on
 * failure so a broken opener never throws into a click handler.
 */
export async function openExternalUrl(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
  } catch {
    try {
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      // No opener available (e.g. non-browser test env); nothing to do.
    }
  }
}
