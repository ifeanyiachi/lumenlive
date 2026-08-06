import { describe, expect, it } from "vitest"
import { songToOpenLyrics } from "./song-to-openlyrics"
import { parseOpenLyrics } from "@/lib/song/import/openlyrics"
import type { Song } from "@/types/song"

const song: Song = {
  id: "song-1",
  title: "Amazing Grace & Hope",
  authors: ["John Newton", "Chris Tomlin"],
  copyright: "Public Domain",
  ccliNumber: "4639462",
  themes: ["Grace"],
  primaryLang: "en",
  sections: [
    {
      id: "s1",
      type: "verse",
      label: "Verse 1",
      lyrics: "Amazing grace\nHow sweet the sound",
    },
    {
      id: "s2",
      type: "chorus",
      label: "Chorus",
      lyrics: "My chains are gone\nI've been set free",
    },
  ],
  arrangements: [
    {
      id: "a1",
      name: "Default",
      sectionIds: ["s1", "s2", "s1"],
      isDefault: true,
    },
  ],
  sourceFormat: "manual",
  createdAt: 0,
  updatedAt: 0,
}

describe("songToOpenLyrics", () => {
  it("produces well-formed OpenLyrics with escaped metadata", () => {
    const xml = songToOpenLyrics(song)
    expect(xml).toContain(
      '<song xmlns="http://openlyrics.info/namespace/2009/song"'
    )
    expect(xml).toContain("<title>Amazing Grace &amp; Hope</title>")
    expect(xml).toContain('<verse name="v1">')
    expect(xml).toContain('<verse name="c1">')
    expect(xml).toContain("<verseOrder>v1 c1 v1</verseOrder>")
    expect(xml).toContain("Amazing grace<br/>How sweet the sound")
  })

  it("round-trips back through the OpenLyrics importer", () => {
    const parsed = parseOpenLyrics(songToOpenLyrics(song))
    expect(parsed.title).toBe("Amazing Grace & Hope")
    expect(parsed.authors).toEqual(["John Newton", "Chris Tomlin"])
    expect(parsed.ccliNumber).toBe("4639462")
    expect(parsed.verseOrder).toEqual(["v1", "c1", "v1"])
    // OpenLyrics names every section (v1, c1…), so a single chorus round-trips
    // as "Chorus 1" — content, order, and type are preserved.
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus 1"])
    expect(parsed.sections.map((s) => s.type)).toEqual(["verse", "chorus"])
    expect(parsed.sections[0].lyrics).toBe("Amazing grace\nHow sweet the sound")
  })
})
