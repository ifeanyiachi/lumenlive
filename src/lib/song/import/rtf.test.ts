import { describe, expect, it } from "vitest"
import { stripRtf } from "./rtf"

describe("stripRtf", () => {
  it("extracts text and maps \\par to newlines", () => {
    const rtf =
      "{\\rtf1\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil Helvetica;}\\f0\\fs96 Amazing grace\\par how sweet the sound}"
    expect(stripRtf(rtf)).toBe("Amazing grace\nhow sweet the sound")
  })

  it("skips ignorable destination groups", () => {
    const rtf =
      "{\\rtf1{\\*\\generator Riched20}{\\colortbl;\\red255\\green255\\blue255;}\\cf1 Hello}"
    expect(stripRtf(rtf)).toBe("Hello")
  })

  it("decodes \\'hh hex escapes", () => {
    expect(stripRtf("{\\rtf1 caf\\'e9}")).toBe("café")
  })

  it("decodes \\uN unicode escapes with a fallback skip", () => {
    // 舗 is a right single quote; the trailing ? is the ANSI fallback.
    expect(stripRtf("{\\rtf1 it\\u8217?s}")).toBe("it’s")
  })

  it("returns non-RTF input unchanged", () => {
    expect(stripRtf("just plain text")).toBe("just plain text")
  })
})
