import { describe, expect, it } from "vitest"
import { parseOpenSong } from "./opensong"

const SAMPLE = `<song>
  <title>Amazing Grace</title>
  <author>John Newton</author>
  <copyright>Public Domain</copyright>
  <ccli>1234</ccli>
  <key>G</key>
  <lyrics>[V1]
 Amazing grace how sweet the sound
 That saved a wretch like me
.G       C
[C]
 My chains are gone
; a comment
 I've been set free</lyrics>
  <presentation>V1 C V1</presentation>
</song>`

describe("parseOpenSong", () => {
  it("reads metadata and presentation order", () => {
    const parsed = parseOpenSong(SAMPLE)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.copyright).toBe("Public Domain")
    expect(parsed.ccliNumber).toBe("1234")
    expect(parsed.key).toBe("G")
    expect(parsed.verseOrder).toEqual(["V1", "C", "V1"])
  })

  it("parses sections from [markers], skipping chords and comments", () => {
    const parsed = parseOpenSong(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections[0]).toMatchObject({
      type: "verse",
      lyrics: "Amazing grace how sweet the sound\nThat saved a wretch like me",
    })
    expect(parsed.sections[1].lyrics).toBe(
      "My chains are gone\nI've been set free"
    )
  })
})
