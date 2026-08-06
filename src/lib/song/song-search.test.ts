import { describe, expect, it } from "vitest"
import { searchSongs } from "./song-search"
import { createDefaultSong, type Song } from "@/types/song"

function makeSong(overrides: Partial<Song>): Song {
  return { ...createDefaultSong(), ...overrides }
}

const amazingGrace = makeSong({
  title: "Amazing Grace",
  authors: ["John Newton"],
  sections: [
    {
      id: "s1",
      type: "verse",
      label: "Verse 1",
      lyrics: "Amazing grace how sweet the sound\nThat saved a wretch like me",
    },
  ],
})

const goodnessOfGod = makeSong({
  title: "Goodness of God",
  authors: ["Jenn Johnson", "Bethel Music"],
  sections: [
    {
      id: "s1",
      type: "chorus",
      label: "Chorus",
      lyrics: "All my life You have been faithful",
    },
  ],
})

const library = [amazingGrace, goodnessOfGod]

describe("searchSongs", () => {
  it("returns every song for an empty or whitespace query", () => {
    expect(searchSongs(library, "")).toEqual(library)
    expect(searchSongs(library, "   ")).toEqual(library)
  })

  it("matches by title", () => {
    const results = searchSongs(library, "amazing")
    expect(results[0]).toBe(amazingGrace)
  })

  it("matches by author", () => {
    const results = searchSongs(library, "bethel")
    expect(results).toContain(goodnessOfGod)
    expect(results).not.toContain(amazingGrace)
  })

  it("matches by lyrics across sections", () => {
    const results = searchSongs(library, "faithful")
    expect(results).toContain(goodnessOfGod)
    expect(results).not.toContain(amazingGrace)
  })

  it("returns an empty list when nothing matches", () => {
    expect(searchSongs(library, "zzznomatch")).toEqual([])
  })
})
