/**
 * Pure update-notice logic. The Tauri updater plugin already decides whether a
 * *newer* build exists (its `check()` returns null when up to date), so the only
 * decision left to us is presentation: given an available update and the version
 * the user last dismissed, should the notice (banner + nav dot) be shown?
 *
 * Kept pure and framework-free so it can be unit-tested and shared by both the
 * banner and the nav-dot selector — a single source of truth for visibility.
 */

/** The serializable slice of an available update the UI needs. */
export interface AvailableUpdate {
  version: string
  notes: string
}

/**
 * Whether an available update should surface a notice.
 *
 * Returns false when nothing is available, or when the available version is the
 * exact one the user already dismissed. A *different* version (i.e. a newer
 * release shipped after the dismissal) re-surfaces the notice, because the
 * dismissed marker is version-scoped rather than a permanent mute.
 */
export function shouldNotifyUpdate(
  available: AvailableUpdate | null,
  dismissedVersion: string | null
): boolean {
  if (!available) return false
  return available.version !== dismissedVersion
}
