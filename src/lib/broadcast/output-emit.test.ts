import { describe, it, expect } from "vitest"
import { resolveLayerFilter } from "./output-emit"
import type { BroadcastOutput, LayerFilter } from "@/types/broadcast"

describe("resolveLayerFilter", () => {
  it("returns the output's own filter when it is a layer-filter output", () => {
    const layers = {
      showContent: true,
      showProps: false,
    } as unknown as LayerFilter
    const output = {
      contentSource: { type: "layer-filter", layers },
    } as unknown as BroadcastOutput
    expect(resolveLayerFilter(output)).toBe(layers)
  })

  it("returns undefined for a non-filter output (shows everything)", () => {
    const output = {
      contentSource: { type: "mirror", sourceOutputId: "main" },
    } as unknown as BroadcastOutput
    expect(resolveLayerFilter(output)).toBeUndefined()
  })
})
