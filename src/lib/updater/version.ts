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
 * Compare two SemVer-compatible application versions. Update policy is based
 * on a minimum supported version, so a newer release must also satisfy an old
 * forced-update policy.
 */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left)
  const b = parseVersion(right)

  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) {
      return a.core[index] > b.core[index] ? 1 : -1
    }
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1

  const length = Math.max(a.prerelease.length, b.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index]
    const rightPart = b.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) > Number(rightPart) ? 1 : -1
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart > rightPart ? 1 : -1
  }

  return 0
}

/** Return true when `current` is allowed to run under `minimum`. */
export function isVersionAtLeast(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) >= 0
}

interface ParsedVersion {
  core: [number, number, number]
  prerelease: string[]
}

function parseVersion(value: string): ParsedVersion {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      value.trim()
    )
  if (!match) throw new Error(`Invalid application version: ${value}`)

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  }
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
