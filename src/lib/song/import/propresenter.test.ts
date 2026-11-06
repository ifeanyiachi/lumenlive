import { describe, expect, it } from "vitest"
import { parsePropresenter } from "./propresenter"

const rtf = (text: string) => `{\\rtf1\\ansi\\ansicpg1252 ${text}}`
const b64 = (s: string) => btoa(s)

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<RVPresentationDocument CCLISongTitle="Amazing Grace" CCLIAuthor="John Newton" CCLIPublisher="Hymns" CCLISongNumber="12345">
  <array rvXMLIvarName="groups">
    <RVSlideGrouping name="Verse 1" uuid="a">
      <RVDisplaySlide>
        <RVTextElement>
          <NSString rvXMLIvarName="RTFData">${b64(rtf("Amazing grace\\par how sweet the sound"))}</NSString>
        </RVTextElement>
      </RVDisplaySlide>
    </RVSlideGrouping>
    <RVSlideGrouping name="Chorus" uuid="b">
      <RVDisplaySlide>
        <RVTextElement>
          <NSString rvXMLIvarName="RTFData">${b64(rtf("My chains are gone"))}</NSString>
        </RVTextElement>
      </RVDisplaySlide>
    </RVSlideGrouping>
  </array>
</RVPresentationDocument>`

describe("parsePropresenter", () => {
  it("reads CCLI metadata from the root element", () => {
    const parsed = parsePropresenter(XML)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton"])
    expect(parsed.publisher).toBe("Hymns")
    expect(parsed.ccliNumber).toBe("12345")
  })

  it("decodes base64 RTF slides grouped into sections", () => {
    const parsed = parsePropresenter(XML)
    expect(parsed.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
    expect(parsed.sections.map((s) => s.type)).toEqual(["verse", "chorus"])
    expect(parsed.sections[0].lyrics).toBe("Amazing grace\nhow sweet the sound")
    expect(parsed.sections[1].lyrics).toBe("My chains are gone")
  })
})
