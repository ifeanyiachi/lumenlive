import { describe, it, expect } from "vitest"
import { parseOnsong } from "./onsong"
import { detectSongFormat, importSongFromText } from "./index"

// Representative slice of a real mattgraham/worship `.onsong` file.
const SONG = `Title: 10,000 Reasons (Bless the Lord)
Artist: Jonas Myrin & Matt Redman
Key: [G]
Tempo: 73
CCLI: 6016351
Copyright: 2011 Thankyou Music
Scripture Reference(s): Psalm 103:1-5

Chorus:
Bless the[C] Lord, O my[G] soul,[D/F#] O my [Em]soul,
[C]Worship His ho[G]ly n[Dsus4]ame.

Verse 1:
The[C] sun comes[G] up, it's a n[D]ew day da[Em]wning

Intro:
[Bm] // [A/C#]  [D] /// [A] /// [G] ///

Tag:
[Em]I'll wor[C]ship Your [D]holy n[Em]ame.`

describe("parseOnsong", () => {
  const song = parseOnsong(SONG)

  it("reads the metadata header", () => {
    expect(song.title).toBe("10,000 Reasons (Bless the Lord)")
    expect(song.authors).toEqual(["Jonas Myrin", "Matt Redman"])
    expect(song.key).toBe("G") // brackets stripped
    expect(song.ccliNumber).toBe("6016351")
    expect(song.copyright).toBe("2011 Thankyou Music")
  })

  it("splits into labelled sections with inferred types", () => {
    // Intro is instrumental-only and drops out; the rest remain in order.
    expect(song.sections.map((s) => s.label)).toEqual([
      "Chorus",
      "Verse 1",
      "Tag",
    ])
    expect(song.sections.map((s) => s.type)).toEqual(["chorus", "verse", "tag"])
  })

  it("strips inline chords to leave clean lyrics", () => {
    const chorus = song.sections.find((s) => s.label === "Chorus")!
    expect(chorus.lyrics).toBe(
      "Bless the Lord, O my soul, O my soul,\nWorship His holy name."
    )
  })

  it("drops chord/beat-only instrumental lines", () => {
    // The Intro was nothing but `[chords] // ///`, so it produced no section.
    expect(song.sections.some((s) => s.label === "Intro")).toBe(false)
  })

  it("does not mistake a metadata line with a colon-bearing value for a section", () => {
    expect(song.sections.some((s) => /scripture/i.test(s.label))).toBe(false)
  })
})

describe("parseOnsong edge cases", () => {
  it("uses a bare first line as the title when there is no Title: key", () => {
    const song = parseOnsong(
      "Amazing Grace\nKey: [G]\n\nVerse 1:\nAmazing grace"
    )
    expect(song.title).toBe("Amazing Grace")
    expect(song.sections).toHaveLength(1)
    expect(song.sections[0].lyrics).toBe("Amazing grace")
  })

  it("auto-numbers a verse when lyrics precede any section header", () => {
    const song = parseOnsong("Title: X\n\n[C]Loose lyric line")
    expect(song.sections[0]).toMatchObject({ label: "Verse 1", type: "verse" })
    expect(song.sections[0].lyrics).toBe("Loose lyric line")
  })
})

describe("detectSongFormat → onsong", () => {
  it("detects by .onsong extension", () => {
    expect(detectSongFormat("10000 Reasons.onsong", "anything")).toBe("onsong")
  })

  it("detects by content (metadata header + colon section labels)", () => {
    expect(detectSongFormat("pasted", SONG)).toBe("onsong")
  })

  it("does not misclassify a ChordPro file as onsong", () => {
    expect(detectSongFormat("x.cho", "{title: Foo}\n{sov}\n[C]hi\n{eov}")).toBe(
      "chordpro"
    )
  })

  it("routes a .onsong file through the OnSong parser end-to-end", () => {
    // Guards the full import path: detection → parseByFormat → buildSong. A
    // missing `onsong` case would silently fall back to plain text, dropping the
    // metadata header (title/artist/key) and mislabelling sections.
    const song = importSongFromText("oceans.onsong", SONG)!
    expect(song.title).toBe("10,000 Reasons (Bless the Lord)")
    expect(song.authors).toEqual(["Jonas Myrin", "Matt Redman"])
    expect(song.sourceFormat).toBe("onsong")
    expect(song.sections.map((s) => s.label)).toEqual([
      "Chorus",
      "Verse 1",
      "Tag",
    ])
  })
})
