/**
 * Where a looping video/audio clip should get its loop from: the media element's
 * native `loop` attribute, or the app's manual seek-and-replay path.
 *
 * Looping used to be driven entirely by hand — wait for the `ended` DOM event (or
 * the RAF/`timeupdate` trim-end check), then `currentTime = start` + `play()`. For
 * a full-length clip served over the packaged `asset://` protocol that dance is
 * unreliable: the `ended` event and the replay request don't always fire/succeed
 * the way they do against the dev server, so the clip silently held its last frame
 * on the audience/projector output in production builds.
 *
 * Native loop sidesteps all of that — the media pipeline restarts inside the
 * already-buffered clip, no `ended` event and no fresh request required. It can
 * only be used when there is no trim boundary, though: native loop always restarts
 * at 0 and runs to the true end, whereas a trimmed loop has to return to `trimStart`
 * at `trimEnd`, which only the manual path can express.
 */

export interface MediaLoopConfig {
  trimStart?: number | null
  trimEnd?: number | null
  loop?: boolean
  endAction?: string
}

/** Loop is requested via the Loop switch (`loop`) or the "When finished" dropdown (`endAction`). */
export function loopRequested(cfg: MediaLoopConfig | null | undefined): boolean {
  return !!cfg && (cfg.loop === true || cfg.endAction === "loop")
}

/** True when the clip has an in- or out-point, so looping must return to `trimStart`. */
export function hasTrimBoundary(
  cfg: MediaLoopConfig | null | undefined
): boolean {
  return !!cfg && ((cfg.trimStart ?? 0) > 0 || cfg.trimEnd != null)
}

/**
 * Whether the media element's native `loop` attribute should be enabled: looping
 * is requested and the clip is untrimmed. When this is true, callers must NOT also
 * run the manual seek-and-replay path (they conflict); when false and looping is
 * still requested (a trimmed clip), the manual path handles it.
 */
export function nativeLoopEnabled(
  cfg: MediaLoopConfig | null | undefined
): boolean {
  return loopRequested(cfg) && !hasTrimBoundary(cfg)
}
