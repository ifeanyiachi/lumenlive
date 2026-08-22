import { describe, it, expect } from "vitest"
import type { SlideElement } from "@/types/slide"
import {
  findScriptureElement,
  findTextRole,
  findTimerElement,
  hasScriptureElement,
  hasTextRole,
  hasTimerElement,
  isTextRole,
  TEXT_PLACEHOLDER_ROLES,
} from "./roles"

const lyrics: SlideElement = {
  id: "l",
  type: "text",
  role: "lyrics",
  text: "",
  fontFamily: "Inter",
  fontSize: 40,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  color: "#fff",
  horizontalAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.4,
  textTransform: "none",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
}

const plainText: SlideElement = { ...lyrics, id: "t", role: undefined }

const timer: SlideElement = {
  id: "tmr",
  type: "timer",
  mode: "duration",
  durationSeconds: 300,
  format: "mm:ss",
  fontFamily: "Inter",
  fontSize: 120,
  fontWeight: 800,
  italic: false,
  color: "#fff",
  horizontalAlign: "center",
  verticalAlign: "middle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
}

const scripture: SlideElement = {
  id: "s",
  type: "scripture",
  reference: "",
  verseText: "",
  translation: "",
  fontFamily: "Inter",
  fontSize: 40,
  fontWeight: 400,
  bold: false,
  italic: false,
  color: "#fff",
  horizontalAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.5,
  referenceFontSize: 24,
  referenceColor: "#ccc",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
}

describe("role helpers", () => {
  it("exposes the four text placeholder roles", () => {
    expect(TEXT_PLACEHOLDER_ROLES).toEqual([
      "lyrics",
      "title",
      "points",
      "body",
    ])
  })

  it("isTextRole narrows only matching text elements", () => {
    expect(isTextRole(lyrics, "lyrics")).toBe(true)
    expect(isTextRole(lyrics, "title")).toBe(false)
    expect(isTextRole(plainText, "lyrics")).toBe(false)
    expect(isTextRole(scripture, "lyrics")).toBe(false)
  })

  it("findTextRole / hasTextRole locate a role across elements", () => {
    const els = [plainText, scripture, lyrics]
    expect(findTextRole(els, "lyrics")?.id).toBe("l")
    expect(findTextRole(els, "title")).toBeUndefined()
    expect(hasTextRole(els, "lyrics")).toBe(true)
    expect(hasTextRole(els, "body")).toBe(false)
  })

  it("findScriptureElement / hasScriptureElement locate a scripture placeholder", () => {
    expect(findScriptureElement([plainText, scripture])?.id).toBe("s")
    expect(hasScriptureElement([plainText, scripture])).toBe(true)
    expect(hasScriptureElement([plainText, lyrics])).toBe(false)
  })

  it("findTimerElement / hasTimerElement locate a timer placeholder", () => {
    expect(findTimerElement([plainText, timer])?.id).toBe("tmr")
    expect(hasTimerElement([plainText, timer])).toBe(true)
    expect(hasTimerElement([plainText, scripture])).toBe(false)
  })
})
