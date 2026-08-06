import { describe, expect, it } from "vitest"
import { parseChordPro } from "./chordpro"

const SAMPLE = `{title: Amazing Grace}
{artist: John Newton}
{key: G}

{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the sound
That [G]saved a wretch like [D]me
{end_of_verse}

{start_of_chorus}
[G]My chains are [C]gone
I've been set [G]free
{end_of_chorus}`

describe("parseChordPro", () => {
  it("reads directives for metadata", () => {
    const parsed = parseChordPro(SAMPLE)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.key).toBe("G")
  })

  it("strips inline chords from lyrics", () => {
    const parsed = parseChordPro(SAMPLE)
    expect(parsed.sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me"
    )
  })

  it("uses environment labels, defaulting the chorus", () => {
    const parsed = parseChordPro(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections.map((s) => s.type)).toEqual(["verse", "chorus"])
    expect(parsed.sections[1].lyrics).toBe(
      "My chains are gone\nI've been set free"
    )
  })

  it("splits directive-free lyrics into blank-line verses", () => {
    const parsed = parseChordPro(
      "{title: T}\n\n[G]line one\nline two\n\nline three"
    )
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Verse 2"])
    expect(parsed.sections[0].lyrics).toBe("line one\nline two")
    expect(parsed.sections[1].lyrics).toBe("line three")
  })

  it("splits multiple artists", () => {
    const parsed = parseChordPro(
      "{title: T}\n{artist: Ada Lovelace and Alan Turing}"
    )
    expect(parsed.authors).toEqual(["Ada Lovelace", "Alan Turing"])
  })
})
