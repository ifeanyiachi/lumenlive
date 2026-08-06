/**
 * Pure web-output presentation helper: the muted-URL builder. No React, no
 * store — the panel passes in what it has and renders the result.
 */

/**
 * For a muted YouTube web item, append `mute=1` to the URL so the audience
 * overlay loads muted. Non-YouTube or unmuted URLs are returned unchanged; a
 * malformed URL is passed through as-is.
 */
export function applyMuteParam(
  url: string,
  muted: boolean,
  isYouTube: boolean
): string {
  if (!(muted && isYouTube)) return url
  try {
    const u = new URL(url)
    u.searchParams.set("mute", "1")
    return u.toString()
  } catch {
    return url
  }
}
