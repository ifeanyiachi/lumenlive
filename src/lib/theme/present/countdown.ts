import type { SlideElement, SlideTextElement } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import { findTimerElement } from "../model"
import type { CountdownContent, PresentedSlide } from "./types"

/**
 * Present a Countdown theme (themeredo.md, Phase 4 / flip F1).
 *
 * A themed countdown *authors* its look (background, heading, timer placeholder),
 * but the ticking is driven by a running `ActiveCountdown` — not the placeholder's
 * static config. So the mapper element-swaps the live runtime onto the timer
 * placeholder (remaining/format/overtime/urgency thresholds) and resolves the
 * label slot (decision D5: the first text element is the heading — a runtime
 * `label` overrides its text, `showLabel:false` drops it).
 *
 * Every {@link CountdownContent} field is optional: an empty `{type:"countdown"}`
 * presents the authored placeholder unchanged (authoring/preview), where the timer
 * element renders its own `durationSeconds` and the heading its authored text.
 */
export function presentCountdown(
  theme: Theme,
  content: CountdownContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  const slide = themeToSlide(theme, newId, now)

  // Timer placeholder ← live runtime. Live remaining is a duration snapshot, so
  // force duration mode; the renderer then shows exactly this many seconds.
  const timer = findTimerElement(slide.elements)
  if (timer) {
    if (content.remainingSeconds !== undefined) {
      timer.mode = "duration"
      timer.durationSeconds = content.remainingSeconds
    }
    if (content.format !== undefined) timer.format = content.format
    if (content.overtime !== undefined) timer.overtime = content.overtime
    if (content.warnSeconds !== undefined) timer.warnSeconds = content.warnSeconds
    if (content.dangerSeconds !== undefined) {
      timer.dangerSeconds = content.dangerSeconds
    }
  }

  // Label slot (D5): the first text element is the heading.
  const labelIndex = slide.elements.findIndex(
    (el: SlideElement) => el.type === "text"
  )
  if (labelIndex !== -1) {
    if (content.showLabel === false) {
      slide.elements.splice(labelIndex, 1)
    } else if (content.label !== undefined) {
      ;(slide.elements[labelIndex] as SlideTextElement).text = content.label
    }
  }

  return [{ slide }]
}
