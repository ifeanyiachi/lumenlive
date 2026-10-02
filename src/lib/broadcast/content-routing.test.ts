import { describe, it, expect } from "vitest"
import {
  DEFAULT_LAYER_FILTER,
  routingFromType,
  toggleLayer,
} from "./content-routing"

describe("routingFromType", () => {
  it("builds an independent full-program feed by default", () => {
    expect(routingFromType("independent")).toEqual({ type: "independent" })
    expect(routingFromType("anything-else")).toEqual({ type: "independent" })
  })

  it("mirrors the main output by default, or a named source", () => {
    expect(routingFromType("mirror")).toEqual({
      type: "mirror",
      sourceOutputId: "main",
    })
    expect(routingFromType("mirror", "alt")).toEqual({
      type: "mirror",
      sourceOutputId: "alt",
    })
  })

  it("starts layer-filter with every layer visible", () => {
    const r = routingFromType("layer-filter")
    expect(r).toEqual({ type: "layer-filter", layers: DEFAULT_LAYER_FILTER })
    // Must be a copy, not the shared constant, so edits don't mutate the default.
    if (r.type === "layer-filter") expect(r.layers).not.toBe(DEFAULT_LAYER_FILTER)
  })
})

describe("toggleLayer", () => {
  it("flips one layer and leaves the rest untouched", () => {
    const base = routingFromType("layer-filter")
    const next = toggleLayer(base, "showProps", false)
    expect(next).toEqual({
      type: "layer-filter",
      layers: { ...DEFAULT_LAYER_FILTER, showProps: false },
    })
    // original is not mutated
    if (base.type === "layer-filter") expect(base.layers.showProps).toBe(true)
  })

  it("is a no-op for non layer-filter routings", () => {
    const mirror = routingFromType("mirror")
    expect(toggleLayer(mirror, "showAlerts", false)).toBe(mirror)
  })
})
