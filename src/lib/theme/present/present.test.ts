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
