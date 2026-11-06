import { describe, expect, it } from "vitest"
import type { VerseRenderData } from "@/types/broadcast"
import { BUILTIN_THEME_BY_TYPE } from "../builtins"
import { findScriptureElement, findTextRole } from "../model"
import { findTimerElement } from "../model/roles"
import {
  presentAnnouncement,
  presentCountdown,
  presentOverlay,
  presentScripture,
  presentScripturePages,
  presentSermon,
  presentSong,
  presentTheme,
} from "./index"

/** Deterministic id source so mapper output is stable across runs. */
function idSource() {
  let n = 0
  return () => `id-${n++}`
}

const VERSE: VerseRenderData = {
  reference: "John 3:16",
  segments: [{ verseNumber: 16, text: "For God so loved the world" }],
}

describe("presentScripture", () => {
  it("keeps the placeholder style-only and rides the verse as render-time payload", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const [presented] = presentScripture(
      theme,
      { type: "scripture", verse: VERSE },
      idSource()
    )

    // The verse is NOT baked into the element (decision D2 → render-time).
    expect(presented.scriptureContent).toEqual(VERSE)
    const el = findScriptureElement(presented.slide.elements)
    expect(el?.verseText).toBe("")
    expect(el?.reference).toBe("")
  })

  it("does not mutate the source theme", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const before = structuredClone(theme)
    presentScripture(theme, { type: "scripture", verse: VERSE }, idSource())
    expect(theme).toEqual(before)
  })
})

describe("presentScripturePages (F4)", () => {
  // A block split upstream into three pages (verse-boundary subsets).
  const PAGES: VerseRenderData[] = [
    { reference: "John 3:16-18", segments: [{ verseNumber: 16, text: "a" }] },
    { reference: "John 3:16-18", segments: [{ verseNumber: 17, text: "b" }] },
    { reference: "John 3:16-18", segments: [{ verseNumber: 18, text: "c" }] },
  ]

  it("materializes one slide per page, each riding its own page verse", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const slides = presentScripturePages(theme, PAGES, idSource())
    expect(slides).toHaveLength(3)
    slides.forEach((s, i) => {
      // Each page carries exactly its own subset as the render-time payload…
      expect(s.scriptureContent).toEqual(PAGES[i])
      // …and the placeholder stays style-only (nothing baked in).
      const el = findScriptureElement(s.slide.elements)
      expect(el?.verseText).toBe("")
      expect(el?.reference).toBe("")
    })
  })

  it("preserves every verse exactly once across the pages (no loss/dup)", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const slides = presentScripturePages(theme, PAGES, idSource())
    const flat = slides.flatMap((s) => s.scriptureContent!.segments)
    expect(flat).toEqual(PAGES.flatMap((p) => p.segments))
  })

  it("a single page is identical to presentScripture", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const paged = presentScripturePages(theme, [VERSE], idSource())
    const single = presentScripture(
      theme,
      { type: "scripture", verse: VERSE },
      idSource()
    )
    expect(paged).toEqual(single)
  })

  it("gives each page a distinct, deep-cloned slide, leaving the theme untouched", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const before = structuredClone(theme)
    const slides = presentScripturePages(theme, PAGES, idSource())
    // Distinct slide identities (fresh id per page).
    const slideIds = slides.map((s) => s.slide.id)
    expect(new Set(slideIds).size).toBe(slides.length)
    // Deep-cloned: pages share no element object with each other or the source.
    expect(slides[0].slide.elements[0]).not.toBe(slides[1].slide.elements[0])
    expect(slides[0].slide.elements[0]).not.toBe(theme.elements[0])
    expect(theme).toEqual(before)
  })
})

describe("presentSong", () => {
  it("materializes one slide per lyric group with the text swapped in", () => {
    const theme = BUILTIN_THEME_BY_TYPE.song
    const groups = ["line one\nline two", "chorus", "bridge"]
    const slides = presentSong(theme, { type: "song", groups }, idSource())

    expect(slides).toHaveLength(3)
    slides.forEach((p, i) => {
      expect(findTextRole(p.slide.elements, "lyrics")?.text).toBe(groups[i])
      expect(p.scriptureContent).toBeUndefined()
    })
    // Distinct ids per materialized slide.
    const ids = slides.map((p) => p.slide.id)
    expect(new Set(ids).size).toBe(3)
  })

  it("empty groups yields a single slide with the lyrics cleared", () => {
    const theme = BUILTIN_THEME_BY_TYPE.song
    const slides = presentSong(theme, { type: "song", groups: [] }, idSource())
    expect(slides).toHaveLength(1)
    expect(findTextRole(slides[0].slide.elements, "lyrics")?.text).toBe("")
  })
})

describe("presentSermon", () => {
  it("overrides title/points when provided", () => {
    const theme = BUILTIN_THEME_BY_TYPE.sermon
    const [p] = presentSermon(
      theme,
      { type: "sermon", title: "Grace", points: "1. one" },
      idSource()
    )
    expect(findTextRole(p.slide.elements, "title")?.text).toBe("Grace")
    expect(findTextRole(p.slide.elements, "points")?.text).toBe("1. one")
  })

  it("keeps authored text when overrides are omitted", () => {
    const theme = BUILTIN_THEME_BY_TYPE.sermon
    const authoredTitle = findTextRole(theme.elements, "title")?.text
    const [p] = presentSermon(theme, { type: "sermon" }, idSource())
    expect(findTextRole(p.slide.elements, "title")?.text).toBe(authoredTitle)
  })
})

describe("presentAnnouncement", () => {
  it("overrides title/body when provided", () => {
    const theme = BUILTIN_THEME_BY_TYPE.announcement
    const [p] = presentAnnouncement(
      theme,
      { type: "announcement", title: "Notice", body: "Details" },
      idSource()
    )
    expect(findTextRole(p.slide.elements, "title")?.text).toBe("Notice")
    expect(findTextRole(p.slide.elements, "body")?.text).toBe("Details")
  })
})

describe("presentCountdown / presentOverlay", () => {
  it("countdown is a faithful single-slide projection carrying its timer", () => {
    const theme = BUILTIN_THEME_BY_TYPE.countdown
    const [p] = presentCountdown(theme, { type: "countdown" }, idSource())
    expect(p.scriptureContent).toBeUndefined()
    expect(findTimerElement(p.slide.elements)).toBeDefined()
  })

  it("element-swaps the live runtime onto the timer placeholder (F1)", () => {
    const theme = BUILTIN_THEME_BY_TYPE.countdown
    const [p] = presentCountdown(
      theme,
      {
        type: "countdown",
        remainingSeconds: 125,
        format: "hh:mm:ss",
        overtime: true,
        warnSeconds: 60,
        dangerSeconds: 10,
      },
      idSource()
    )
    const timer = findTimerElement(p.slide.elements)!
    expect(timer.mode).toBe("duration")
    expect(timer.durationSeconds).toBe(125)
    expect(timer.format).toBe("hh:mm:ss")
    expect(timer.overtime).toBe(true)
    expect(timer.warnSeconds).toBe(60)
    expect(timer.dangerSeconds).toBe(10)
  })

  it("overrides the heading with a runtime label, and drops it when hidden (D5)", () => {
    const theme = BUILTIN_THEME_BY_TYPE.countdown
    const textCount = (els: { type: string }[]) =>
      els.filter((e) => e.type === "text").length

    const [shown] = presentCountdown(
      theme,
      { type: "countdown", label: "Doors open in", showLabel: true },
      idSource()
    )
    const labelEl = shown.slide.elements.find((e) => e.type === "text")
    expect(labelEl).toBeDefined()
    if (labelEl?.type === "text") expect(labelEl.text).toBe("Doors open in")

    const [hidden] = presentCountdown(
      theme,
      { type: "countdown", showLabel: false },
      idSource()
    )
    expect(textCount(hidden.slide.elements)).toBe(
      textCount(shown.slide.elements) - 1
    )
  })

  it("synthesises a label when a migrated theme has only a timer (F3)", () => {
    const base = BUILTIN_THEME_BY_TYPE.countdown
    // A migrated countdown theme carries only the timer element (no heading).
    const timerOnly = {
      ...base,
      elements: base.elements.filter((e) => e.type === "timer"),
    }
    const [p] = presentCountdown(
      timerOnly,
      { type: "countdown", label: "Back in", showLabel: true },
      idSource()
    )
    const label = p.slide.elements.find((e) => e.type === "text")
    expect(label).toBeDefined()
    if (label?.type === "text") expect(label.text).toBe("Back in")
    // The timer element is still present alongside the synthesised label.
    expect(findTimerElement(p.slide.elements)).toBeDefined()
  })

  it("leaves the authored placeholder untouched for empty content", () => {
    const theme = BUILTIN_THEME_BY_TYPE.countdown
    const authored = findTimerElement(
      presentCountdown(theme, { type: "countdown" }, idSource())[0].slide
        .elements
    )!
    // The built-in's authored duration survives when no runtime is supplied.
    expect(authored.durationSeconds).toBe(600)
  })

  it("overlay is a faithful single-slide projection over transparent bg", () => {
    const theme = BUILTIN_THEME_BY_TYPE.overlay
    const [p] = presentOverlay(theme, { type: "overlay" }, idSource())
    expect(p.slide.background.type).toBe("transparent")
  })
})

describe("presentTheme dispatch", () => {
  it("routes by theme type", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    const slides = presentTheme(
      theme,
      { type: "scripture", verse: VERSE },
      idSource()
    )
    expect(slides[0].scriptureContent).toEqual(VERSE)
  })

  it("throws when content type does not match theme type", () => {
    const theme = BUILTIN_THEME_BY_TYPE.scripture
    expect(() =>
      presentTheme(theme, { type: "song", groups: ["x"] }, idSource())
    ).toThrow(/does not match/)
  })
})
