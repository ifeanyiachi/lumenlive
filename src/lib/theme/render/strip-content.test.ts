import { describe, it, expect } from "vitest"
import type { SlideElement } from "@/types/slide"
import type { Theme } from "@/types/theme"
import {
  SCRIPTURE_BUILTIN,
  SERMON_BUILTIN,
  COUNTDOWN_BUILTIN,
} from "../builtins"
import { stripPlaceholderContent, stripThemeContent } from "./strip-content"

describe("stripPlaceholderContent", () => {
  it("clears the scripture placeholder's sample text but keeps its styling", () => {
    const [stripped] = stripPlaceholderContent(SCRIPTURE_BUILTIN.elements)
    if (stripped.type !== "scripture") throw new Error("expected scripture")
    expect(stripped.reference).toBe("")
    expect(stripped.verseText).toBe("")
    expect(stripped.translation).toBe("")
    // Styling survives so the (now empty) element still lays out identically.
    expect(stripped.fontSize).toBe(44)
    expect(stripped.referenceColor).toBe("#94a3b8")
    expect(stripped.id).toBe("scripture-placeholder")
  })

  it("blanks roled (placeholder) text elements", () => {
    const stripped = stripPlaceholderContent(SERMON_BUILTIN.elements)
    // Both sermon elements carry a placeholder role (title / points).
    expect(stripped).toHaveLength(2)
    for (const el of stripped) {
      expect(el.type).toBe("text")
      if (el.type === "text") expect(el.text).toBe("")
    }
  })

  it("keeps roleless (fixed-decoration) text verbatim", () => {
    const fixed: SlideElement = {
      id: "watermark",
      type: "text",
      text: "Grace Chapel",
      fontFamily: "Inter",
      fontSize: 24,
      fontWeight: 400,
      bold: false,
      italic: false,
      underline: false,
      color: "#ffffff",
      horizontalAlign: "center",
      verticalAlign: "middle",
      lineHeight: 1.4,
      textTransform: "none",
      x: 0,
      y: 0,
      width: 100,
      height: 10,
    }
    expect(stripPlaceholderContent([fixed])).toEqual([fixed])
  })

  it("drops timer elements (no live countdown on an idle backdrop)", () => {
    const stripped = stripPlaceholderContent(COUNTDOWN_BUILTIN.elements)
    // The heading (roleless text) survives; the timer is gone.
    expect(stripped.some((el) => el.type === "timer")).toBe(false)
    expect(stripped).toEqual([
      expect.objectContaining({ id: "countdown-heading", type: "text" }),
    ])
  })

  it("keeps decorative shapes, images, and videos untouched", () => {
    const decor: SlideElement[] = [
      {
        id: "box",
        type: "shape",
        shapeType: "rounded-rect",
        fillColor: "rgba(0,0,0,0.5)",
        strokeColor: "#fff",
        strokeWidth: 0,
        opacity: 1,
        borderRadius: 8,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      },
      {
        id: "logo",
        type: "image",
        imageUrl: "logo.png",
        objectFit: "contain",
        opacity: 1,
        borderRadius: 0,
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
    ]
    expect(stripPlaceholderContent(decor)).toEqual(decor)
  })

  it("is pure — the input array and elements are not mutated", () => {
    const before = structuredClone(SCRIPTURE_BUILTIN.elements)
    stripPlaceholderContent(SCRIPTURE_BUILTIN.elements)
    expect(SCRIPTURE_BUILTIN.elements).toEqual(before)
  })
})

describe("stripThemeContent", () => {
  it("blanks placeholder content while preserving identity and background", () => {
    const stripped = stripThemeContent(SCRIPTURE_BUILTIN)
    expect(stripped.id).toBe(SCRIPTURE_BUILTIN.id)
    expect(stripped.name).toBe(SCRIPTURE_BUILTIN.name)
    expect(stripped.background).toEqual(SCRIPTURE_BUILTIN.background)
    const el = stripped.elements[0]
    if (el.type !== "scripture") throw new Error("expected scripture")
    expect(el.verseText).toBe("")
  })

  it("leaves an already content-free theme structurally equal", () => {
    const empty: Theme = { ...SCRIPTURE_BUILTIN, elements: [] }
    expect(stripThemeContent(empty).elements).toEqual([])
  })
})
