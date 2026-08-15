import type { NdiAlphaMode } from "@/types"

/**
 * Decide whether an NDI frame should be sent **see-through** (straight alpha,
 * foreground-only) rather than as the normal opaque program mirror.
 *
 * The app's audience program is opaque by design: content composites over a
 * black floor, the central base background, and any media layer. A keyable feed
 * for a downstream switcher (scripture over a live camera) is the opposite — it
 * must carry ONLY the foreground graphics with a transparent background. That is
 * only meaningful for content whose own background is `transparent` and where
 * nothing opaque sits behind it in this output.
 *
 * Pure so the (fiddly) eligibility rule is unit-tested in one place instead of
 * living inline in the hot push loop. When this returns false the caller uses
 * the unchanged opaque path, so the common case is provably untouched.
 */
export interface NdiKeyEligibilityInput {
  /** The output's NDI alpha mode. Only `straightAlpha` opts into keying. */
  alphaMode: NdiAlphaMode
  /** Live-output holds — any of these force an opaque (or black) frame. */
  blackout: boolean
  showLogo: boolean
  clearForeground: boolean
  /** What the output is currently showing. */
  mode: "verse" | "slide" | "media"
  /** The active content's background type (`theme`/`slide` background). */
  backgroundType?: string
  /**
   * True when an opaque central base theme is composited behind a transparent
   * verse (i.e. the base differs from the verse's own theme). That backdrop is
   * opaque, so the frame can't be keyed.
   */
  hasOpaqueBaseTheme: boolean
  /** True when a media layer is painted behind the content (opaque backdrop). */
  hasMediaLayer: boolean
}

export function shouldSendTransparentNdi(i: NdiKeyEligibilityInput): boolean {
  // Only the "transparent background" alpha mode opts in.
  if (i.alphaMode !== "straightAlpha") return false
  // Any live-output hold paints an opaque/black frame that must not be keyed.
  if (i.blackout || i.showLogo || i.clearForeground) return false
  // A media layer behind the content is an opaque backdrop.
  if (i.hasMediaLayer) return false

  switch (i.mode) {
    case "verse":
      // Transparent verse over its own theme (no opaque base behind it).
      return i.backgroundType === "transparent" && !i.hasOpaqueBaseTheme
    case "slide":
      // Transparent slide/song draws only its elements — keyable.
      return i.backgroundType === "transparent"
    case "media":
      // Image/video/audio fills the frame opaquely — never keyable.
      return false
  }
}
