import { describe, expect, it } from "vitest"
import {
  generateSlidesFromSong,
  chunkSectionLyrics,
  resolveSongSlideOptions,
  DEFAULT_SONG_SLIDE_OPTIONS,
} from "./song-to-slides"
import type { Song, SongArrangement, SongSlideOptions } from "@/types/song"

/** Deterministic id generator so output is byte-comparable across runs. */
function seededIds() {
  let n = 0
  return () => `id-${++n}`
}

const NOW = 1_700_000_000_000

function song(sections: Song["sections"]): Song {
  return {
    id: "song-1",
    title: "Test Song",
    authors: ["Ada Lovelace"],
    themes: [],
    primaryLang: "en",
    sections,
    arrangements: [],
    sourceFormat: "manual",
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function arrangement(sectionIds: string[]): SongArrangement {
  return { id: "arr-1", name: "Default", sectionIds, isDefault: true }
}

const OPTS: SongSlideOptions = {
  themeId: "theme-worship-lyrics",
  maxLinesPerSlide: 4,
  breakOnBlankLines: true,
  includeTitleSlide: false,
  includeBlankEndSlide: false,
  showSectionLabels: false,
  fontSize: null,
  transition: "cut",
  transparentBackground: false,
}

describe("chunkSectionLyrics", () => {
  it("hard-wraps a 6-line stanza at 4 lines into 2 chunks", () => {
    const chunks = chunkSectionLyrics("l1\nl2\nl3\nl4\nl5\nl6", 4, true)
    expect(chunks).toEqual(["l1\nl2\nl3\nl4", "l5\nl6"])
  })

  it("breaks on blank lines (stanza-aware) when enabled", () => {
    const chunks = chunkSectionLyrics("a1\na2\n\nb1\nb2", 4, true)
    expect(chunks).toEqual(["a1\na2", "b1\nb2"])
  })

  it("ignores blank lines when disabled, wrapping only by line count", () => {
    const chunks = chunkSectionLyrics("a1\na2\n\nb1\nb2", 4, false)
    expect(chunks).toEqual(["a1\na2\nb1\nb2"])
  })

  it("keeps one very long single line as one chunk", () => {
    const long = "word ".repeat(50).trim()
    expect(chunkSectionLyrics(long, 4, true)).toEqual([long])
  })

  it("yields no chunks for an all-whitespace section", () => {
    expect(chunkSectionLyrics("   \n\n  ", 4, true)).toEqual([])
  })

  it("clamps maxLinesPerSlide to at least 1", () => {
    expect(chunkSectionLyrics("l1\nl2", 0, true)).toEqual(["l1", "l2"])
  })
})

describe("generateSlidesFromSong", () => {
  const s = song([
    {
      id: "v1",
      type: "verse",
      label: "Verse 1",
      lyrics: "l1\nl2\nl3\nl4\nl5\nl6",
    },
    { id: "c", type: "chorus", label: "Chorus", lyrics: "c1\nc2" },
    { id: "empty", type: "verse", label: "Verse 2", lyrics: "   " },
  ])

  it("expands sections into slides, wrapping a 6-line verse into 2", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["v1", "c"]),
      OPTS,
      seededIds(),
      NOW
    )
    expect(deck.slides).toHaveLength(3) // 2 (verse) + 1 (chorus)
    expect(deck.slides.map((sl) => sl.name)).toEqual([
      "Verse 1",
      "Verse 1",
      "Chorus",
    ])
    expect((deck.slides[0].elements[0] as { text: string }).text).toBe(
      "l1\nl2\nl3\nl4"
    )
    expect((deck.slides[2].elements[0] as { text: string }).text).toBe("c1\nc2")
  })

  it("repeats a section as many times as it appears in the arrangement", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c", "v1", "c"]),
      OPTS,
      seededIds(),
      NOW
    )
    // chorus(1) + verse(2) + chorus(1) = 4
    expect(deck.slides.map((sl) => sl.name)).toEqual([
      "Chorus",
      "Verse 1",
      "Verse 1",
      "Chorus",
    ])
  })

  it("skips empty sections and unresolved section ids without crashing", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["empty", "does-not-exist", "c"]),
      OPTS,
      seededIds(),
      NOW
    )
    expect(deck.slides.map((sl) => sl.name)).toEqual(["Chorus"])
  })

  it("adds title and blank slides when toggled on", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      { ...OPTS, includeTitleSlide: true, includeBlankEndSlide: true },
      seededIds(),
      NOW
    )
    expect(deck.slides.map((sl) => sl.name)).toEqual([
      "Title",
      "Chorus",
      "Blank",
    ])
    // Title slide carries the song title + author; blank slide has no elements.
    expect((deck.slides[0].elements[0] as { text: string }).text).toBe(
      "Test Song"
    )
    expect(deck.slides[2].elements).toEqual([])
  })

  it("emits a section-label element when showSectionLabels is on", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      { ...OPTS, showSectionLabels: true },
      seededIds(),
      NOW
    )
    expect(deck.slides[0].elements).toHaveLength(2)
    expect((deck.slides[0].elements[1] as { text: string }).text).toBe("Chorus")
  })

  it("is deterministic — identical inputs produce byte-identical output (golden)", () => {
    const a = generateSlidesFromSong(
      s,
      arrangement(["v1", "c"]),
      OPTS,
      seededIds(),
      NOW
    )
    const b = generateSlidesFromSong(
      s,
      arrangement(["v1", "c"]),
      OPTS,
      seededIds(),
      NOW
    )
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it("applies a fontSize override to lyric text (theme size when null)", () => {
    const sized = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      { ...OPTS, fontSize: 90 },
      seededIds(),
      NOW
    )
    expect((sized.slides[0].elements[0] as { fontSize: number }).fontSize).toBe(
      90
    )

    const themed = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      OPTS,
      seededIds(),
      NOW
    )
    expect(
      (themed.slides[0].elements[0] as { fontSize: number }).fontSize
    ).not.toBe(90)
  })

  it("bakes an animated theme background onto generated slides", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      { ...OPTS, themeId: "theme-aurora-worship" },
      seededIds(),
      NOW
    )
    const bg = deck.slides[0].background
    expect(bg.type).toBe("animated")
    expect(bg.animated?.preset).toBe("aurora")
  })

  it("merges a per-song animated-background override onto the theme spec", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      {
        ...OPTS,
        themeId: "theme-aurora-worship",
        animatedBackground: { speed: 1.75, intensity: 0.2, preset: "bokeh" },
      },
      seededIds(),
      NOW
    )
    const anim = deck.slides[0].background.animated!
    expect(anim.speed).toBe(1.75)
    expect(anim.intensity).toBe(0.2)
    expect(anim.preset).toBe("bokeh")
    // Untouched fields still come from the theme.
    expect(anim.palette).toEqual(["#4c1d95", "#1e3a8a", "#0ea5e9"])
  })

  it("ignores an animated override on a non-animated theme", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      {
        ...OPTS,
        themeId: "theme-worship-lyrics",
        animatedBackground: { speed: 2 },
      },
      seededIds(),
      NOW
    )
    expect(deck.slides[0].background.type).not.toBe("animated")
  })

  it("stamps the chosen transition on every slide; cut leaves it unset", () => {
    const faded = generateSlidesFromSong(
      s,
      arrangement(["v1", "c"]),
      { ...OPTS, transition: "fade", includeBlankEndSlide: true },
      seededIds(),
      NOW
    )
    for (const slide of faded.slides) {
      expect(slide.transition).toEqual({ type: "fade", duration: 500 })
    }

    const cut = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      OPTS,
      seededIds(),
      NOW
    )
    expect(cut.slides[0].transition).toBeUndefined()
  })

  it("replaces the theme background with transparency when toggled on", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      {
        ...OPTS,
        transparentBackground: true,
        includeTitleSlide: true,
        includeBlankEndSlide: true,
      },
      seededIds(),
      NOW
    )
    for (const slide of deck.slides) {
      expect(slide.background).toEqual({ type: "transparent" })
    }
  })

  it("falls back to a solid background for an unknown theme", () => {
    const deck = generateSlidesFromSong(
      s,
      arrangement(["c"]),
      { ...OPTS, themeId: "no-such-theme" },
      seededIds(),
      NOW
    )
    expect(deck.slides[0].background).toEqual({
      type: "solid",
      color: "#000000",
    })
  })
})

describe("resolveSongSlideOptions", () => {
  it("returns the defaults when there is no override", () => {
    expect(resolveSongSlideOptions(DEFAULT_SONG_SLIDE_OPTIONS)).toEqual(
      DEFAULT_SONG_SLIDE_OPTIONS
    )
  })

  it("lets a per-song field win while undefined fields inherit", () => {
    const resolved = resolveSongSlideOptions(DEFAULT_SONG_SLIDE_OPTIONS, {
      maxLinesPerSlide: 2,
      includeTitleSlide: true,
    })
    expect(resolved.maxLinesPerSlide).toBe(2)
    expect(resolved.includeTitleSlide).toBe(true)
    expect(resolved.themeId).toBe(DEFAULT_SONG_SLIDE_OPTIONS.themeId)
  })

  it("keeps an explicit false override (not treated as unset)", () => {
    const resolved = resolveSongSlideOptions(
      { ...DEFAULT_SONG_SLIDE_OPTIONS, includeBlankEndSlide: true },
      { includeBlankEndSlide: false }
    )
    expect(resolved.includeBlankEndSlide).toBe(false)
  })

  it("fills fontSize/transition/transparentBackground from app defaults when a persisted settings object predates them", () => {
    // Simulate a settings blob saved before these fields existed.
    const legacy = { ...DEFAULT_SONG_SLIDE_OPTIONS } as Record<string, unknown>
    delete legacy.fontSize
    delete legacy.transition
    delete legacy.transparentBackground
    const resolved = resolveSongSlideOptions(
      legacy as unknown as SongSlideOptions
    )
    expect(resolved.fontSize).toBeNull()
    expect(resolved.transition).toBe("cut")
    expect(resolved.transparentBackground).toBe(false)
  })

  it("resolves the new per-song overrides", () => {
    const resolved = resolveSongSlideOptions(DEFAULT_SONG_SLIDE_OPTIONS, {
      fontSize: 64,
      transition: "dissolve",
      transparentBackground: true,
    })
    expect(resolved.fontSize).toBe(64)
    expect(resolved.transition).toBe("dissolve")
    expect(resolved.transparentBackground).toBe(true)
  })
})
