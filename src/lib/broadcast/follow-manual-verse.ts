/**
 * Decides whether the operator's manual Bible selection should be mirrored into
 * the Program preview ("follow manual selection").
 *
 * The Live-output panel mirrors the currently-selected verse into the preview so
 * the operator can take it live. The subtlety this function encodes: a verse is
 * *always* selected in the Bible browser (there is a default selection at
 * launch), so a naive "stage the selection" effect fires the instant the Live
 * toggle flips on and shoves that default verse into Program — clobbering
 * whatever was staged and making "go live" never start clean. It must therefore:
 *
 *  - never stage while off-air;
 *  - never stage on the off→on Live transition itself (go-live starts clean —
 *    content reaches Program only via an explicit present/take); it only follows
 *    a *subsequent* change the operator makes to the selection;
 *  - never overwrite a slide/media/web/queue item deliberately staged from
 *    another source (a pending, non-"manual" preview);
 *  - never overwrite a multi-verse *block* deliberately staged from the
 *    queue/schedule (e.g. "Present"/"Add group" of a selection), even once it has
 *    been taken live — the single Bible selection can't represent the group, so
 *    following it would flip Program off the block and onto one verse. The
 *    operator releases this pin by manually picking a verse (followManualSelection
 *    resets the source), which is the intended "browse away" gesture;
 *  - do nothing when there is no selection.
 */
export function shouldStageManualVerse(params: {
  /** Live output currently on? */
  isLive: boolean
  /** Live output state on the previous evaluation (transition detection). */
  wasLive: boolean
  /** Is a verse selected in the Bible browser? */
  hasSelection: boolean
  /** Is something currently staged (pending) in the preview? */
  previewPending: boolean
  /** Source that staged the current preview, if any. */
  previewSource: "schedule" | "queue" | "manual" | null
  /**
   * Segment count of the currently-staged preview verse (a multi-verse block has
   * more than one). Defaults to a single segment when omitted.
   */
  previewSegments?: number
}): boolean {
  const {
    isLive,
    wasLive,
    hasSelection,
    previewPending,
    previewSource,
    previewSegments = 1,
  } = params
  if (!isLive) return false
  // Off→on Live transition: start clean, don't auto-stage the default selection.
  if (!wasLive) return false
  if (!hasSelection) return false
  // A pending item staged from another source is the operator's deliberate
  // "next up" — never clobber it by following the Bible selection.
  if (previewPending && previewSource !== null && previewSource !== "manual") {
    return false
  }
  // A multi-verse block staged from the queue/schedule stays pinned even after it
  // is taken live: the single selection can't represent it, so following would
  // shrink Program to one verse. Released when the operator manually picks a verse
  // (which nulls previewSource via followManualSelection).
  if (
    previewSegments > 1 &&
    (previewSource === "queue" || previewSource === "schedule")
  ) {
    return false
  }
  return true
}
