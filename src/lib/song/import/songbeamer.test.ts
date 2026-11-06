import { describe, expect, it } from "vitest"
import { parseSongBeamer } from "./songbeamer"

const SAMPLE = `#LangCount=1
#Title=Amazing Grace
#Author=John Newton
#CCLI=4639462
#(c)=Public Domain
#VerseOrder=Verse 1,Chorus,STOP
---
Verse 1
Amazing grace how sweet the sound
That saved a wretch like me
---
Chorus
My chains are gone`

describe("parseSongBeamer", () => {
  it("reads the #Key=Value header", () => {
    const parsed = parseSongBeamer(SAMPLE)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.ccliNumber).toBe("4639462")
    expect(parsed.copyright).toBe("Public Domain")
  })

  it("drops the STOP terminator from the verse order", () => {
    expect(parseSongBeamer(SAMPLE).verseOrder).toEqual(["Verse 1", "Chorus"])
  })

  it("uses each block's first line as the caption and the rest as lyrics", () => {
    const parsed = parseSongBeamer(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections[0]).toMatchObject({
      type: "verse",
      lyrics: "Amazing grace how sweet the sound\nThat saved a wretch like me",
    })
    expect(parsed.sections[1].lyrics).toBe("My chains are gone")
  })
})
