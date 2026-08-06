import { describe, expect, it } from "vitest"
import { parseQuelea } from "./quelea"

const XML = `<song>
  <title>Amazing Grace</title>
  <author>John Newton</author>
  <ccli>1234567</ccli>
  <copyright>Public Domain</copyright>
  <lyrics>
    <section title="Verse 1" capitalise="false"><lyrics>Amazing grace! How sweet the sound
That saved a wretch like me!</lyrics></section>
    <section title="Chorus"><lyrics>My chains are gone
I've been set free</lyrics></section>
  </lyrics>
</song>`

describe("parseQuelea", () => {
  it("reads metadata", () => {
    const parsed = parseQuelea(XML)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.ccliNumber).toBe("1234567")
    expect(parsed.copyright).toBe("Public Domain")
  })

  it("parses titled sections and their nested lyrics", () => {
    const parsed = parseQuelea(XML)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections[0]).toMatchObject({
      type: "verse",
      lyrics:
        "Amazing grace! How sweet the sound\nThat saved a wretch like me!",
    })
    expect(parsed.sections[1].lyrics).toBe(
      "My chains are gone\nI've been set free"
    )
  })
})
