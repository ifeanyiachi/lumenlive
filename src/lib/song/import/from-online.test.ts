import { describe, it, expect } from "vitest"
import type { LyricsContent } from "@/types/lyrics"
import {
  splitLyricsIntoSections,
  lyricsContentToParsedSong,
  importOnlineSong,
} from "./from-online"

const content = (over: Partial<LyricsContent> = {}): LyricsContent => ({
  source: "lrclib",
  title: "Amazing Grace",
  artist: "John Newton",
  plainLyrics: "",
  ...over,
})

describe("splitLyricsIntoSections", () => {
  it("splits header-less lyrics into one verse per blank-line stanza", () => {
    const secs = splitLyricsIntoSections("a\nb\n\nc\nd\n\ne")
    expect(secs.map((s) => s.label)).toEqual(["Verse 1", "Verse 2", "Verse 3"])
    expect(secs[0].lyrics).toBe("a\nb")
    expect(secs.every((s) => s.type === "verse")).toBe(true)
  })

  it("splits on word headers and infers the section type", () => {
    const secs = splitLyricsIntoSections(
      "Verse 1\nline a\nline b\n\nChorus\nc1\nc2"
    )
    expect(secs).toHaveLength(2)
    expect(secs[0]).toMatchObject({
      label: "Verse 1",
      type: "verse",
      lyrics: "line a\nline b",
    })
    expect(secs[1]).toMatchObject({
      label: "Chorus",
      type: "chorus",
      lyrics: "c1\nc2",
    })
  })

  it("splits on bracketed headers and drops performer annotations", () => {
    const secs = splitLyricsIntoSections(
      "[Verse 1: Lead]\na\n[Pre-Chorus]\np\n[Chorus]\nc"
    )
    expect(secs.map((s) => s.label)).toEqual([
      "Verse 1",
      "Pre-Chorus",
      "Chorus",
    ])
    expect(secs.map((s) => s.type)).toEqual(["verse", "pre_chorus", "chorus"])
  })

  it("captures lyrics before the first header as Verse 1", () => {
    const secs = splitLyricsIntoSections("floating line\n\n[Chorus]\nc")
    expect(secs).toHaveLength(2)
    expect(secs[0]).toMatchObject({ label: "Verse 1", lyrics: "floating line" })
    expect(secs[1]).toMatchObject({ label: "Chorus", lyrics: "c" })
  })

  it("normalises CRLF and returns [] for empty input", () => {
    expect(splitLyricsIntoSections("")).toEqual([])
    expect(splitLyricsIntoSections("   \n  ")).toEqual([])
    const secs = splitLyricsIntoSections("a\r\nb\r\n\r\nc")
    expect(secs.map((s) => s.lyrics)).toEqual(["a\nb", "c"])
  })
})

describe("lyricsContentToParsedSong", () => {
  it("maps title and artist and splits lyrics", () => {
    const parsed = lyricsContentToParsedSong(content({ plainLyrics: "a\n\nb" }))
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.sections).toHaveLength(2)
  })

  it("omits an empty artist and falls back to an Untitled title", () => {
    const parsed = lyricsContentToParsedSong(
      content({ title: "  ", artist: "  ", plainLyrics: "x" })
    )
    expect(parsed.title).toBe("Untitled Song")
    expect(parsed.authors).toEqual([])
  })
})

describe("importOnlineSong", () => {
  it("builds a Song tagged as an online import, deterministically", () => {
    let n = 0
    const song = importOnlineSong(
      content({ plainLyrics: "a\n\nb" }),
      () => `id-${n++}`,
      123
    )
    expect(song.sourceFormat).toBe("online")
    expect(song.createdAt).toBe(123)
    expect(song.updatedAt).toBe(123)
    expect(song.title).toBe("Amazing Grace")
    expect(song.authors).toEqual(["John Newton"])
    expect(song.sections).toHaveLength(2)
    expect(song.arrangements).toHaveLength(1)
    expect(song.arrangements[0].isDefault).toBe(true)
    expect(song.arrangements[0].sectionIds).toEqual(
      song.sections.map((s) => s.id)
    )
  })
})
