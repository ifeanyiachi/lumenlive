import type {
  Slide,
  SlideBackground,
  SlideTextElement,
  SlideVideoElement,
} from "@/types/slide"

/**
 * Cheap structural queries over a slide, used by callers to decide whether a
 * slide needs a video render loop or a text-scroll animation frame.
 */

export function slideHasVideoBackground(slide: Slide): boolean {
  return slide.background.type === "video" && !!slide.background.videoUrl
}

export function slideHasVideo(slide: Slide): boolean {
  return (
    slideHasVideoBackground(slide) ||
    slide.elements.some(
      (el) => el.type === "video" && (el as SlideVideoElement).videoUrl
    )
  )
}

export function slideHasScrollingText(slide: Slide): boolean {
  return slide.elements.some(
    (el) => el.type === "text" && !!(el as SlideTextElement).scrolling
  )
}

export function slideHasAnimatedBackground(slide: Slide): boolean {
  return slide.background.type === "animated" && !!slide.background.animated
}

/**
 * True when the slide carries a timer element. A timer's displayed time changes
 * over wall-clock time (clock mode) or would tick live at go-live, so surfaces
 * use this to keep a per-frame redraw loop alive — the same role
 * {@link slideHasScrollingText}/{@link slideHasAnimatedBackground} play for their
 * animated content.
 */
export function slideHasTimer(slide: Slide): boolean {
  return slide.elements.some((el) => el.type === "timer")
}

/**
 * True when two backgrounds are the same animated spec. Used by transitions to
 * decide whether the background can persist (keep animating continuously) while
 * only the element/text layers cross-fade — avoiding a double-background ghost.
 */
export function sameAnimatedBackground(
  a: SlideBackground,
  b: SlideBackground
): boolean {
  if (a.type !== "animated" || b.type !== "animated") return false
  if (!a.animated || !b.animated) return false
  const x = a.animated
  const y = b.animated
  return (
    x.preset === y.preset &&
    x.speed === y.speed &&
    x.intensity === y.intensity &&
    x.baseColor === y.baseColor &&
    x.palette.length === y.palette.length &&
    x.palette.every((c, i) => c === y.palette[i])
  )
}
