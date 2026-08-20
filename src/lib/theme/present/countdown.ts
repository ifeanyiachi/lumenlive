import type {
  SlideTextElement,
  SlideTimerElement,
} from "@/types/slide"
import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import { findTimerElement } from "../model"
import type { CountdownContent, PresentedSlide } from "./types"

/**
 * Present a Countdown theme (themeredo.md, Phase 4 / flip F1+F3).
 *
 * A themed countdown *authors* its look (background, heading, timer placeholder),
 * but the ticking is driven by a running `ActiveCountdown` — not the placeholder's
 * static config. So the mapper element-swaps the live runtime onto the timer
 * placeholder (remaining/format/overtime/urgency thresholds) and resolves the
 * label slot (decision D5: the first text element is the heading — a runtime
 * `label` overrides its text, `showLabel:false` drops it).
 *
 * A *migrated* countdown theme carries only the timer element (the old model had
 * no authored heading — the label was a runtime string on the reference slot). So
 * when a runtime `label` is supplied and no text element exists, one is
 * synthesised above the timer, styled from it, so the operator's label still
 * shows.
 *
 * Every {@link CountdownContent} field is optional: an empty `{type:"countdown"}`
 * presents the authored placeholder unchanged (authoring/preview).
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
  const labelIndex = slide.elements.findIndex((el) => el.type === "text")
  if (content.showLabel === false) {
    if (labelIndex !== -1) slide.elements.splice(labelIndex, 1)
  } else if (content.label !== undefined && content.label !== "") {
    if (labelIndex !== -1) {
      ;(slide.elements[labelIndex] as SlideTextElement).text = content.label
    } else if (timer) {
      // Migrated theme with no authored heading — synthesise one above the timer.
      slide.elements.unshift(countdownLabel(content.label, timer, newId))
    }
  }

  return [{ slide }]
}

/** A heading text element above `timer`, styled from it, for a missing label slot. */
function countdownLabel(
  text: string,
  timer: SlideTimerElement,
  newId: () => string
): SlideTextElement {
  return {
    id: newId(),
    type: "text",
    text,
    x: timer.x,
    y: Math.max(0, timer.y - 14),
    width: timer.width,
    height: 12,
    fontFamily: timer.fontFamily,
    fontSize: Math.max(16, Math.round(timer.fontSize * 0.35)),
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: timer.color,
    horizontalAlign: timer.horizontalAlign,
    verticalAlign: "middle",
    lineHeight: 1.2,
    textTransform: "none",
  }
}
