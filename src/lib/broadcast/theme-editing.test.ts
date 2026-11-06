import { describe, expect, it } from "vitest"
import { setNestedValue } from "./theme-editing"

describe("setNestedValue", () => {
  it("sets a shallow key immutably", () => {
    const obj = { a: 1, b: 2 }
    const next = setNestedValue(obj, "a", 9)
    expect(next).toEqual({ a: 9, b: 2 })
    expect(obj.a).toBe(1)
  })

  it("sets a deep key, cloning only along the path", () => {
    const obj = { layout: { offsetX: 0, offsetY: 5 }, other: { k: 1 } }
    const next = setNestedValue(obj, "layout.offsetX", 42) as typeof obj
    expect(next.layout.offsetX).toBe(42)
    expect(next.layout.offsetY).toBe(5)
    expect(next.other).toBe(obj.other) // untouched branch shared by reference
    expect(obj.layout.offsetX).toBe(0)
  })

  it("addresses array indices with numeric segments", () => {
    const obj = { stops: [{ position: 0 }, { position: 1 }] }
    const next = setNestedValue(obj, "stops.1.position", 0.5) as typeof obj
    expect(next.stops[1].position).toBe(0.5)
    expect(next.stops[0]).toBe(obj.stops[0])
  })

  it("creates missing containers based on the next segment type", () => {
    const next = setNestedValue({}, "a.0.b", "x") as { a: { b: string }[] }
    expect(Array.isArray(next.a)).toBe(true)
    expect(next.a[0].b).toBe("x")
  })
})
