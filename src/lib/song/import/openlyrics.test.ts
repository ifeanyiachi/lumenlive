import { describe, expect, it } from "vitest"
import { parseOpenLyrics } from "./openlyrics"

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" xml:lang="en">
  <properties>
    <titles><title>Amazing Grace</title></titles>
    <authors><author>John Newton</author><author type="music">Traditional</author></authors>
    <copyright>public domain</copyright>
    <ccliNo>4639462</ccliNo>
    <verseOrder>v1 c v2</verseOrder>
    <themes><theme>Grace</theme></themes>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines>Amazing grace how sweet the sound<br/>That saved a wretch like me</lines>
    </verse>
    <verse name="c">
      <lines>My chains are gone<br/>I've been set free</lines>
    </verse>
    <verse name="v2">
      <lines>'Twas grace that taught<br/>my heart to fear</lines>
    </verse>
  </lyrics>
</song>`

describe("parseOpenLyrics", () => {
  it("extracts metadata from properties", () => {
    const parsed = parseOpenLyrics(SAMPLE)
    expect(parsed.title).toBe("Amazing Grace")
    expect(parsed.authors).toEqual(["John Newton", "Traditional"])
    expect(parsed.copyright).toBe("public domain")
    expect(parsed.ccliNumber).toBe("4639462")
    expect(parsed.themes).toEqual(["Grace"])
    expect(parsed.verseOrder).toEqual(["v1", "c", "v2"])
  })

  it("parses verses, converting <br/> to newlines and labelling by name", () => {
    const parsed = parseOpenLyrics(SAMPLE)
    expect(parsed.sections.map((s) => s.label)).toEqual([
      "Verse 1",
      "Chorus",
      "Verse 2",
    ])
    expect(parsed.sections.map((s) => s.type)).toEqual([
      "verse",
      "chorus",
      "verse",
    ])
    expect(parsed.sections[0]).toMatchObject({
      name: "v1",
      lyrics: "Amazing grace how sweet the sound\nThat saved a wretch like me",
    })
  })

  it("decodes XML entities and strips inline chord markup", () => {
    const xml = `<song><properties><titles><title>Faith &amp; Hope</title></titles></properties>
      <lyrics><verse name="v1"><lines><chord name="G"/>Grace &gt; all</lines></verse></lyrics></song>`
    const parsed = parseOpenLyrics(xml)
    expect(parsed.title).toBe("Faith & Hope")
    expect(parsed.sections[0].lyrics).toBe("Grace > all")
  })

  it("joins multiple <lines> blocks as blank-line-separated stanzas", () => {
    const xml = `<song><properties><titles><title>T</title></titles></properties>
      <lyrics><verse name="v1"><lines>a1<br/>a2</lines><lines>b1<br/>b2</lines></verse></lyrics></song>`
    const parsed = parseOpenLyrics(xml)
    expect(parsed.sections[0].lyrics).toBe("a1\na2\n\nb1\nb2")
  })
})
