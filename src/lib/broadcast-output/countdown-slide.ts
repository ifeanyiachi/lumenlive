import type { ActiveCountdown, CountdownTimer } from "@/types/alert"
import type { Slide } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { presentCountdown } from "@/lib/theme/present"
import { findTimerElement } from "@/lib/theme/model"
import { computeRemainingSeconds } from "@/lib/countdown/timer"

/**
 * Memoised presented-slide builder for the themed countdown overlay (themeredo.md,
 * flip F3 / decision D6).
 *
 * The overlay redraws every RAF frame; rebuilding the slide via `themeToSlide`
 * (a deep clone) each frame would allocate in the draw loop (perf rule 1). So the
 * work is split: the *structural* slide (background, heading, timer placeholder
 * styling) is built once via {@link presentCountdown} and cached per timer, rebuilt
 * only when the theme, label, or label visibility changes; the *dynamic* fields
 * (remaining seconds + format/overtime/urgency thresholds) are written onto the
 * cached timer element every frame as cheap scalar assignments. The timer element
 * then derives the same digit string + urgency colour the old `renderCountdownTheme`
 * path did, frame-to-frame (the 4d parity gate proves that agreement).
 *
 * Not pure (module-level cache), by design — the same shape the perf sweep uses for
 * persistent offscreen canvases. {@link resetCountdownSlideCache} clears it (tests).
 */

interface CacheEntry {
  theme: Theme
  label: string
  showLabel: boolean
  slide: Slide
}

const cache = new Map<string, CacheEntry>()

/** Deterministic element ids per timer (the slide is rebuilt rarely). */
function idSource(timerId: string): () => string {
  let n = 0
  return () => `cd-${timerId}-${n++}`
}

/**
 * The presented slide for a live themed countdown, ready to hand to `renderSlide`.
 * Reuses the cached structural slide when nothing structural changed, updating only
 * the live timer fields for `now`.
 */
export function buildCountdownSlide(
  timer: CountdownTimer,
  theme: Theme,
  countdown: ActiveCountdown,
  now: number
): Slide {
  const showLabel = timer.showLabel !== false
  const label = timer.label
  const cached = cache.get(timer.id)

  let slide: Slide
  if (
    cached &&
    cached.theme === theme &&
    cached.label === label &&
    cached.showLabel === showLabel
  ) {
    slide = cached.slide
  } else {
    slide = presentCountdown(
      theme,
      { type: "countdown", label, showLabel },
      idSource(timer.id)
    )[0].slide
    cache.set(timer.id, { theme, label, showLabel, slide })
  }

  // Dynamic per-frame fields onto the cached timer element (cheap scalar writes).
  const timerEl = findTimerElement(slide.elements)
  if (timerEl) {
    timerEl.mode = "duration"
    timerEl.durationSeconds = computeRemainingSeconds(countdown, now)
    timerEl.format = timer.format
    timerEl.overtime = timer.endAction === "overtime"
    timerEl.warnSeconds = timer.warnSeconds
    timerEl.dangerSeconds = timer.dangerSeconds
  }
  return slide
}

/** Drop cached slides for timers no longer drawn (called by the overlay each draw). */
export function pruneCountdownSlideCache(
  activeTimerIds: Iterable<string>
): void {
  const keep = new Set(activeTimerIds)
  for (const id of cache.keys()) if (!keep.has(id)) cache.delete(id)
}

/** Clear the whole cache. */
export function resetCountdownSlideCache(): void {
  cache.clear()
}
