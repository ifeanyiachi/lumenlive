import { describe, expect, it } from "vitest"
import { parseCcliTxt } from "./ccli-txt"

const SAMPLE = `CCLI Song # 4639462
Amazing Grace (My Chains Are Gone)

Verse 1
Amazing grace how sweet the sound
That saved a wretch like me

Chorus
My chains are gone I've been set free

© 2006 sixsteps Music
CCLI License # 123456`

describe("parseCcliTxt", () => {
  it("reads the CCLI number and title", () => {
    const parsed = parseCcliTxt(SAMPLE)
    expect(parsed.ccliNumber).toBe("4639462")
    expect(parsed.title).toBe("Amazing Grace (My Chains Are Gone)")
  })

  it("reads the copyright line", () => {
    expect(parseCcliTxt(SAMPLE).copyright).toBe("2006 sixsteps Music")
  })

  it("parses labelled sections and stops at trailing metadata", () => {
    const parsed = parseCcliTxt(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me"
    )
    expect(parsed.sections[1]).toMatchObject({
      type: "chorus",
      lyrics: "My chains are gone I've been set free",
    })
  })

  it("does not turn the copyright/license block into lyrics", () => {
    const lyrics = parseCcliTxt(SAMPLE)
      .sections.map((s) => s.lyrics)
      .join("\n")
    expect(lyrics).not.toMatch(/CCLI License/)
    expect(lyrics).not.toMatch(/sixsteps/)
  })
})
