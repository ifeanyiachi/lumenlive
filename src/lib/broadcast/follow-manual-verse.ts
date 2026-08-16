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
}): boolean {
  const { isLive, wasLive, hasSelection, previewPending, previewSource } =
    params
  if (!isLive) return false
  // Off→on Live transition: start clean, don't auto-stage the default selection.
  if (!wasLive) return false
  if (!hasSelection) return false
  // A pending item staged from another source is the operator's deliberate
  // "next up" — never clobber it by following the Bible selection.
  if (previewPending && previewSource !== null && previewSource !== "manual") {
    return false
  }
  return true
}
