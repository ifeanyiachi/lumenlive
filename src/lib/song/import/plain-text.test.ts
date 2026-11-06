import { describe, expect, it } from "vitest"
import { parsePlainText } from "./plain-text"

describe("parsePlainText", () => {
  it("splits blank-line blocks into auto-numbered verses", () => {
    const parsed = parsePlainText("line a\nline b\n\nline c\nline d", "My Song")
    expect(parsed.title).toBe("My Song")
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0]).toMatchObject({
      label: "Verse 1",
      lyrics: "line a\nline b",
    })
    expect(parsed.sections[1]).toMatchObject({
      label: "Verse 2",
      lyrics: "line c\nline d",
    })
  })

  it("recognises section headers and infers their type", () => {
    const parsed = parsePlainText(
      "Verse 1\nlyric one\nlyric two\n\nChorus\nhook line",
      "Hymn"
    )
    expect(parsed.sections[0]).toMatchObject({
      type: "verse",
      label: "Verse 1",
      lyrics: "lyric one\nlyric two",
    })
    expect(parsed.sections[1]).toMatchObject({
      type: "chorus",
      label: "Chorus",
      lyrics: "hook line",
    })
  })

  it("normalises header casing and trailing colons", () => {
    const parsed = parsePlainText("chorus:\nhook", "S")
    expect(parsed.sections[0].label).toBe("Chorus")
  })

  it("does not treat a lyric line beginning with a keyword as a header", () => {
    const parsed = parsePlainText("Verse of my heart sings\nto you", "S")
    expect(parsed.sections[0].label).toBe("Verse 1")
    expect(parsed.sections[0].lyrics).toBe("Verse of my heart sings\nto you")
  })
})
