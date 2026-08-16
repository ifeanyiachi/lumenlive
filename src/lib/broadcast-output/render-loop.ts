/**
 * Single-RAF render scheduler for the output window (S2 Phase 4 / resolves P1).
 *
 * The output window used to run a fistful of independent `requestAnimationFrame`
 * loops side by side — slide video, media layer, slide entry-animation, marquee,
 * countdown, the verse theme's animated background, and a video base background —
 * each calling a full `draw()` (and, for most, an NDI `getImageData` readback)
 * every frame. With several active at once that meant N draws + N readbacks per
 * frame for one visible result.
 *
 * This scheduler collapses them into **one RAF that draws at most once per frame**.
 * Callers `activate`/`deactivate` named *reasons*; while ≥1 reason is active the
 * loop ticks once per frame and invokes a single `onFrame(shouldPush)` callback.
 * Per-reason semantics are preserved exactly by two flags:
 *   - `push` — whether this reason's frames should push an NDI frame. The verse
 *     `themeAnim` / `baseVideo` reasons are draw-only (they never pushed on their
 *     own); everything else pushes. `onFrame` is told to push iff any active
 *     reason wants it, so mixing a draw-only reason with a pushing one still pushes.
 *   - `keepAlive` + `keepAliveTiming` — an optional predicate that auto-deactivates
 *     the reason when its animation ends, checked either **before** the frame
 *     (the reason skips its final draw — matches the loops that guarded at the top
 *     of their tick) or **after** (the reason draws one last frame first — matches
 *     the entry-animation loop that advanced its tracker, drew, then decided
 *     whether to continue).
 *
 * A reason with no `keepAlive` runs until an external `deactivate`/`stop`
 * (e.g. the media-layer loop, cancelled when the layer changes). `beforeFrame`
 * runs reason-specific pre-draw work (advancing the entry-animation tracker).
 *
 * The RAF hooks are injectable so the scheduler is unit-testable without a real
 * animation-frame clock.
 */

/** The animation drivers coalesced into the single loop. */
export type RenderReason =
  | "slideVideo"
  | "mediaLayer"
  | "slideAnim"
  | "marquee"
  | "countdown"
  | "themeAnim"
  | "baseVideo"

export interface ReasonConfig {
  /** Whether frames driven by this reason push an NDI frame. Default true. */
  push?: boolean
  /** Reason-specific work to run each frame before the shared draw. */
  beforeFrame?: () => void
  /** When it returns false the reason auto-deactivates. Omit to run until stopped. */
  keepAlive?: () => boolean
  /**
   * When `keepAlive` is evaluated relative to the frame's draw:
   *   - "before" (default) — checked at the top of the tick; a stopped reason
   *     does NOT draw a final frame.
   *   - "after" — checked once the frame has drawn; the reason draws one last time
   *     before stopping.
   */
  keepAliveTiming?: "before" | "after"
}

export interface RenderLoopDeps {
  /**
   * Draw exactly one frame. `shouldPush` is true when at least one active reason
   * this frame wants an NDI push (the caller pushes iff true).
   */
  onFrame: (shouldPush: boolean) => void
  requestFrame?: (cb: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
}

export interface RenderLoop {
  /** Mark a reason active (with its config), starting the loop if idle. */
  activate(reason: RenderReason, config?: ReasonConfig): void
  /** Mark a reason inactive; the loop stops after the last reason clears. */
  deactivate(reason: RenderReason): void
  isActive(reason: RenderReason): boolean
  /** Number of currently-active reasons. */
  size(): number
  /** Cancel the pending frame and clear every reason. */
  stop(): void
}

export function createRenderLoop(deps: RenderLoopDeps): RenderLoop {
  const requestFrame =
    deps.requestFrame ?? ((cb) => requestAnimationFrame(cb))
  const cancelFrame = deps.cancelFrame ?? ((h) => cancelAnimationFrame(h))

  const reasons = new Map<RenderReason, ReasonConfig>()
  let handle = 0

  function schedule(): void {
    if (handle !== 0 || reasons.size === 0) return
    handle = requestFrame(tick)
  }

  function pruneByTiming(timing: "before" | "after"): void {
    for (const [reason, cfg] of reasons) {
      const t = cfg.keepAliveTiming ?? "before"
      if (t === timing && cfg.keepAlive && !cfg.keepAlive()) {
        reasons.delete(reason)
      }
    }
  }

  function tick(): void {
    handle = 0

    // 1. Reasons that guard at the top of their tick drop before drawing.
    pruneByTiming("before")
    if (reasons.size === 0) return

    // 2. Reason-specific pre-draw work (e.g. advance an animation tracker).
    for (const cfg of reasons.values()) cfg.beforeFrame?.()

    // 3. One coalesced draw; push iff any surviving reason wants it.
    let shouldPush = false
    for (const cfg of reasons.values()) {
      if (cfg.push ?? true) {
        shouldPush = true
        break
      }
    }
    deps.onFrame(shouldPush)

    // 4. Reasons that decide after drawing (e.g. entry-animation completion).
    pruneByTiming("after")

    // 5. Keep going while any reason remains.
    schedule()
  }

  return {
    activate(reason, config = {}) {
      reasons.set(reason, config)
      schedule()
    },
    deactivate(reason) {
      reasons.delete(reason)
    },
    isActive(reason) {
      return reasons.has(reason)
    },
    size() {
      return reasons.size
    },
    stop() {
      if (handle !== 0) {
        cancelFrame(handle)
        handle = 0
      }
      reasons.clear()
    },
  }
}
