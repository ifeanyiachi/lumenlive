import { describe, it, expect } from "vitest"
import { isEditableTarget } from "./is-editable-target"

function el(tagName: string, contentEditable = false): HTMLElement {
  return {
    tagName,
    isContentEditable: contentEditable,
  } as unknown as HTMLElement
}

describe("isEditableTarget", () => {
  it("returns true for input, textarea, and select", () => {
    expect(isEditableTarget(el("INPUT"))).toBe(true)
    expect(isEditableTarget(el("TEXTAREA"))).toBe(true)
    expect(isEditableTarget(el("SELECT"))).toBe(true)
  })

  it("returns true for contentEditable nodes regardless of tag", () => {
    expect(isEditableTarget(el("DIV", true))).toBe(true)
  })

  it("returns false for non-editable elements", () => {
    expect(isEditableTarget(el("DIV"))).toBe(false)
    expect(isEditableTarget(el("BUTTON"))).toBe(false)
  })

  it("returns false for null / non-element targets", () => {
    expect(isEditableTarget(null)).toBe(false)
    // document/window have no tagName and isContentEditable is undefined
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false)
  })
})
