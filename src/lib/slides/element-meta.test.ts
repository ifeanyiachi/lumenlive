import { describe, it, expect } from "vitest"

import { elementLabel, TRANSITION_LABEL_KEYS } from "./element-meta"
import type { SlideElement } from "@/types/slide"

// Minimal element factory — only the fields elementLabel reads.
function el(partial: Partial<SlideElement> & { type: string }): SlideElement {
  return partial as SlideElement
}

const labels: Record<string, string> = {
  "layer.element.image": "Image",
  "layer.element.scripture": "Scripture",
  "layer.element.shape": "Shape",
  "layer.element.circle": "Circle",
  "layer.element.roundedRect": "Rounded Rect",
  "layer.element.rectangle": "Rectangle",
  "layer.element.video": "Video",
  "layer.element.timer": "Timer",
  "layer.element.emptyText": "Empty text",
  "layer.element.default": "Element",
}
const t = (key: string) => labels[key]

describe("elementLabel", () => {
  it("labels images and videos with fixed nouns", () => {
    expect(elementLabel(el({ type: "image" }), t)).toBe("Image")
    expect(elementLabel(el({ type: "video" }), t)).toBe("Video")
  })

  it("labels scripture by reference, falling back to 'Scripture'", () => {
    expect(
      elementLabel(el({ type: "scripture", reference: "John 3:16" }), t)
    ).toBe("John 3:16")
    expect(elementLabel(el({ type: "scripture", reference: "" }), t)).toBe(
      "Scripture"
    )
  })

  it("labels shapes by their specific shape type", () => {
    expect(elementLabel(el({ type: "shape", shapeType: "circle" }), t)).toBe(
      "Circle"
    )
    expect(
      elementLabel(el({ type: "shape", shapeType: "rounded-rect" }), t)
    ).toBe("Rounded Rect")
    expect(elementLabel(el({ type: "shape", shapeType: "rectangle" }), t)).toBe(
      "Rectangle"
    )
  })

  it("labels text by its first 30 chars, else 'Empty text'", () => {
    expect(elementLabel(el({ type: "text", text: "Amazing grace" }), t)).toBe(
      "Amazing grace"
    )
    expect(
      elementLabel(
        el({ type: "text", text: "0123456789012345678901234567890123456789" }),
        t
      )
    ).toBe("012345678901234567890123456789")
    expect(elementLabel(el({ type: "text", text: "" }), t)).toBe("Empty text")
  })

  it("defaults an untyped element to text handling", () => {
    // type is required by the router, but the label falls back to "text".
    expect(elementLabel(el({ type: "text", text: "hi" }), t)).toBe("hi")
  })
})

describe("TRANSITION_LABEL_KEYS", () => {
  it("maps cut and every transition type to a translation key", () => {
    expect(TRANSITION_LABEL_KEYS).toEqual({
      cut: "slideThumb.transitionOptions.cut",
      fade: "slideThumb.transitionOptions.fade",
      dissolve: "slideThumb.transitionOptions.dissolve",
      "push-left": "slideThumb.transitionOptions.pushLeft",
      "push-right": "slideThumb.transitionOptions.pushRight",
      "wipe-left": "slideThumb.transitionOptions.wipeLeft",
      "wipe-right": "slideThumb.transitionOptions.wipeRight",
    })
  })
})
