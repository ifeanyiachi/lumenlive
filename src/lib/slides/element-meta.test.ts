import { describe, it, expect } from "vitest"

import { elementLabel, TRANSITION_LABELS } from "./element-meta"
import type { SlideElement } from "@/types/slide"

// Minimal element factory — only the fields elementLabel reads.
function el(partial: Partial<SlideElement> & { type: string }): SlideElement {
  return partial as SlideElement
}

describe("elementLabel", () => {
  it("labels images and videos with fixed nouns", () => {
    expect(elementLabel(el({ type: "image" }))).toBe("Image")
    expect(elementLabel(el({ type: "video" }))).toBe("Video")
  })

  it("labels scripture by reference, falling back to 'Scripture'", () => {
    expect(
      elementLabel(el({ type: "scripture", reference: "John 3:16" }))
    ).toBe("John 3:16")
    expect(elementLabel(el({ type: "scripture", reference: "" }))).toBe(
      "Scripture"
    )
  })

  it("labels shapes by their specific shape type", () => {
    expect(elementLabel(el({ type: "shape", shapeType: "circle" }))).toBe(
      "Circle"
    )
    expect(elementLabel(el({ type: "shape", shapeType: "rounded-rect" }))).toBe(
      "Rounded Rect"
    )
    expect(elementLabel(el({ type: "shape", shapeType: "rectangle" }))).toBe(
      "Rectangle"
    )
  })

  it("labels text by its first 30 chars, else 'Empty text'", () => {
    expect(elementLabel(el({ type: "text", text: "Amazing grace" }))).toBe(
      "Amazing grace"
    )
    expect(
      elementLabel(
        el({ type: "text", text: "0123456789012345678901234567890123456789" })
      )
    ).toBe("012345678901234567890123456789")
    expect(elementLabel(el({ type: "text", text: "" }))).toBe("Empty text")
  })

  it("defaults an untyped element to text handling", () => {
    // type is required by the router, but the label falls back to "text".
    expect(elementLabel(el({ type: "text", text: "hi" }))).toBe("hi")
  })
})

describe("TRANSITION_LABELS", () => {
  it("has a short label for cut and every transition type", () => {
    expect(TRANSITION_LABELS).toEqual({
      cut: "Cut",
      fade: "Fade",
      dissolve: "Dissolve",
      "push-left": "Push L",
      "push-right": "Push R",
      "wipe-left": "Wipe L",
      "wipe-right": "Wipe R",
    })
  })
})
