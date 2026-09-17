/**
 * Pure helpers for recognising and inverting the webview asset URLs that
 * `@/lib/media/safe-file-src` (Tauri's `convertFileSrc`) produces.
 *
 * A schedule bundle has to travel media that is referenced two ways:
 *  - by `mediaAssetId` (a media-library pointer), and
 *  - by a raw `imageUrl` / `videoUrl` string baked onto a slide or theme, which
 *    is an *asset URL* wrapping the source machine's absolute file path.
 *
 * To package the second kind we must recover the original filesystem path from
 * the URL (so the byte-copier can find the file) and, on import, rebuild a fresh
 * asset URL for the file's new managed location. `convertFileSrc` isn't
 * available in `src/lib/**` (no `@tauri-apps` here) — and its output differs by
 * platform — so this module inverts the URL by hand and the *forward* direction
 * is injected (`toAssetUrl`) by the caller.
 *
 * `convertFileSrc` output shapes (Tauri v2):
 *  - macOS / Linux:      `asset://localhost/<encodeURIComponent(path)>`
 *  - Windows / Android:  `http://asset.localhost/<encodeURIComponent(path)>`
 *    (and `https://asset.localhost/…` behind some webview configs)
 */

/** Prefixes `convertFileSrc` emits before the URL-encoded absolute path. */
const ASSET_URL_PREFIXES = [
  "asset://localhost/",
  "asset://",
  "https://asset.localhost/",
  "http://asset.localhost/",
]

/**
 * Recover the absolute local file path from an asset URL, or return `null` for
 * anything that isn't a local-file asset URL — a `data:`/`blob:` URL (already
 * self-contained), a remote `http(s)://` URL, an empty string, or a value that
 * doesn't decode to something path-shaped. `null` means "leave this reference
 * untouched; it needs no bundling".
 */
export function extractLocalPath(
  url: string | undefined | null
): string | null {
  if (!url) return null

  const prefix = ASSET_URL_PREFIXES.find((p) => url.startsWith(p))
  if (!prefix) return null

  let rest = url.slice(prefix.length)
  // Drop any query/hash the webview may have appended.
  rest = rest.replace(/[?#].*$/, "")
  if (!rest) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(rest)
  } catch {
    return null
  }

  // A leading slash can survive for POSIX absolute paths encoded as
  // "/Users/…"; keep it. Reject anything that doesn't look like an absolute
  // path (drive-letter or leading separator) — a bare "logo.png" is a relative
  // authored value we can't resolve and must not treat as a local file.
  if (!looksAbsolute(decoded)) return null
  return decoded
}

/** True when a decoded string looks like an absolute filesystem path. */
function looksAbsolute(path: string): boolean {
  // Windows drive: C:\… or C:/…  (optionally with a leading slash from the URL)
  if (/^\/?[a-zA-Z]:[\\/]/.test(path)) return true
  // POSIX absolute, or a UNC path (\\server\share)
  if (path.startsWith("/") || path.startsWith("\\\\")) return true
  return false
}

/** True when `url` is a local-file asset URL we can package (see {@link extractLocalPath}). */
export function isLocalAssetUrl(url: string | undefined | null): boolean {
  return extractLocalPath(url) !== null
}
