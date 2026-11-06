import { describe, expect, it } from "vitest"
import { detectSongFormat, importSongFromText, importSongAs } from "./index"

function seededIds() {
  let n = 0
  return () => `id-${++n}`
}

describe("detectSongFormat", () => {
  it("detects OpenLyrics by extension or content", () => {
    expect(detectSongFormat("song.xml", "<song>...")).toBe("openlyrics")
    expect(detectSongFormat("pasted", '<?xml version="1.0"?><song/>')).toBe(
      "openlyrics"
    )
  })

  it("detects ChordPro by extension or directive", () => {
    expect(detectSongFormat("song.cho", "text")).toBe("chordpro")
    expect(detectSongFormat("pasted.txt", "{title: X}\n[G]hi")).toBe("chordpro")
  })

  it("detects CCLI txt by marker", () => {
    expect(detectSongFormat("s.txt", "CCLI Song # 123\nTitle")).toBe("ccli_txt")
  })

  it("distinguishes OpenSong from OpenLyrics XML", () => {
    expect(
      detectSongFormat(
        "s.xml",
        "<song><lyrics>[V1]\n hi</lyrics><presentation>V1</presentation></song>"
      )
    ).toBe("opensong")
    expect(
      detectSongFormat(
        "s.xml",
        '<song><lyrics><verse name="v1"><lines>hi</lines></verse></lyrics></song>'
      )
    ).toBe("openlyrics")
  })

  it("detects SongBeamer and legacy CCLI .usr by extension or content", () => {
    expect(detectSongFormat("s.sng", "#Title=X")).toBe("songbeamer")
    expect(detectSongFormat("pasted", "#LangCount=1\n#Title=X")).toBe(
      "songbeamer"
    )
    expect(detectSongFormat("s.usr", "Title=X")).toBe("ccli_usr")
    expect(detectSongFormat("pasted", "Type=SongSelect Import File")).toBe(
      "ccli_usr"
    )
  })

  it("detects ProPresenter by extension or root element", () => {
    expect(detectSongFormat("song.pro6", "anything")).toBe("propresenter")
    expect(detectSongFormat("x", '<RVPresentationDocument foo="1">')).toBe(
      "propresenter"
    )
  })

  it("falls back to plain text", () => {
    expect(detectSongFormat("notes.txt", "just some lyrics")).toBe("manual")
  })
})

describe("importSongAs", () => {
  it("forces a chosen format, bypassing detection", () => {
    const xml =
      '<song><title>Grace</title><lyrics><section title="Verse 1"><lyrics>hi</lyrics></section></lyrics></song>'
    const song = importSongAs("quelea", "pack.xml", xml, () => "id", 0)!
    expect(song.sourceFormat).toBe("quelea")
    expect(song.title).toBe("Grace")
    expect(song.sections[0]).toMatchObject({ label: "Verse 1", lyrics: "hi" })
  })
})

describe("importSongFromText", () => {
  it("returns null for empty text", () => {
    expect(importSongFromText("a.txt", "   ", seededIds(), 0)).toBeNull()
  })

  it("builds a normalised Song with a default arrangement over all sections", () => {
    const song = importSongFromText(
      "My Song.txt",
      "Verse 1\nl1\nl2\n\nChorus\nc1",
      seededIds(),
      1000
    )
    expect(song).not.toBeNull()
    expect(song!.title).toBe("My Song")
    expect(song!.sourceFormat).toBe("manual")
    expect(song!.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(song!.arrangements).toHaveLength(1)
    expect(song!.arrangements[0].isDefault).toBe(true)
    expect(song!.arrangements[0].sectionIds).toEqual(
      song!.sections.map((s) => s.id)
    )
    expect(song!.createdAt).toBe(1000)
  })

  it("honours OpenLyrics verseOrder in the default arrangement", () => {
    const xml = `<song><properties><titles><title>T</title></titles>
      <verseOrder>c v1</verseOrder></properties>
      <lyrics><verse name="v1"><lines>a</lines></verse><verse name="c"><lines>b</lines></verse></lyrics></song>`
    const song = importSongFromText("t.xml", xml, seededIds(), 0)!
    const byLabel = new Map(song.sections.map((s) => [s.label, s.id]))
    expect(song.arrangements[0].sectionIds).toEqual([
      byLabel.get("Chorus"),
      byLabel.get("Verse 1"),
    ])
  })

  it("routes a ChordPro paste (no extension) by content", () => {
    const song = importSongFromText(
      "Pasted",
      "{title: Grace}\n{soc}\nhook\n{eoc}",
      seededIds(),
      0
    )!
    expect(song.sourceFormat).toBe("chordpro")
    expect(song.title).toBe("Grace")
    expect(song.sections[0]).toMatchObject({ label: "Chorus", lyrics: "hook" })
  })
})
