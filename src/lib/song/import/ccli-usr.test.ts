import { describe, expect, it } from "vitest"
import { parseCcliUsr } from "./ccli-usr"

const SAMPLE = `[File]
Type=SongSelect Import File
Version=3.0
[S A14181]
Title=Above All
Author=LeBlanc, Lenny | Baloche, Paul
Copyright=1999 Integrity's Hosanna! Music
Themes=Cross/tKingship
Fields=Verse 1/tChorus 1
Words=Above all powers/nAbove all kings/tCrucified/nLaid behind a stone`

describe("parseCcliUsr", () => {
  it("reads title, authors (split on |), copyright and CCLI number", () => {
    const parsed = parseCcliUsr(SAMPLE)
    expect(parsed.title).toBe("Above All")
    expect(parsed.authors).toEqual(["LeBlanc, Lenny", "Baloche, Paul"])
    expect(parsed.copyright).toBe("1999 Integrity's Hosanna! Music")
    expect(parsed.ccliNumber).toBe("14181")
    expect(parsed.themes).toEqual(["Cross", "Kingship"])
  })

  it("zips Fields with Words, using /t between sections and /n within", () => {
    const parsed = parseCcliUsr(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus 1"])
    expect(parsed.sections[0]).toMatchObject({
      type: "verse",
      lyrics: "Above all powers\nAbove all kings",
    })
    expect(parsed.sections[1]).toMatchObject({
      type: "chorus",
      lyrics: "Crucified\nLaid behind a stone",
    })
  })
})
