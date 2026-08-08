import { describe, expect, it } from "vitest"
import {
  findOutput,
  resolveThemeId,
  resolveEffectiveOutput,
  updateOutputInArray,
} from "./output-selectors"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastOutput, ContentRouting } from "@/types"

function output(
  id: string,
  themeId: string,
  contentSource: ContentRouting = { type: "independent" }
): BroadcastOutput {
  return {
    id,
    name: id,
    themeId,
    mode: "normal",
    contentSource,
    enabled: true,
  }
}

const mirror = (sourceOutputId: string): ContentRouting => ({
  type: "mirror",
  sourceOutputId,
})

describe("output-selectors", () => {
  const outputs = [output("main", "theme-a"), output("alt", "theme-b")]

  it("findOutput returns the matching output or undefined", () => {
    expect(findOutput(outputs, "alt")?.themeId).toBe("theme-b")
    expect(findOutput(outputs, "missing")).toBeUndefined()
  })

  it("resolveThemeId returns the output's own theme when present", () => {
    expect(resolveThemeId(outputs, "alt")).toBe("theme-b")
  })

  it("resolveThemeId falls back to the first output's theme", () => {
    expect(resolveThemeId(outputs, "missing")).toBe("theme-a")
  })

  it("resolveThemeId falls back to the first built-in theme when no outputs", () => {
    expect(resolveThemeId([], "missing")).toBe(BUILTIN_THEMES[0].id)
  })

  it("updateOutputInArray patches only the matching output and clones the array", () => {
    const next = updateOutputInArray(outputs, "main", { themeId: "theme-x" })
    expect(next).not.toBe(outputs)
    expect(next[0].themeId).toBe("theme-x")
    expect(next[1]).toBe(outputs[1]) // untouched entry kept by reference
    expect(outputs[0].themeId).toBe("theme-a") // input unchanged
  })
})

describe("resolveEffectiveOutput — mirror chains", () => {
  it("returns the output itself when it is independent", () => {
    const outs = [output("main", "theme-a")]
    expect(resolveEffectiveOutput(outs, "main")?.id).toBe("main")
  })

  it("returns undefined when the output id matches nothing", () => {
    expect(resolveEffectiveOutput([], "ghost")).toBeUndefined()
  })

  it("follows a mirror to its source", () => {
    const outs = [
      output("main", "theme-a"),
      output("alt", "theme-b", mirror("main")),
    ]
    const eff = resolveEffectiveOutput(outs, "alt")
    expect(eff?.id).toBe("main")
    expect(eff?.themeId).toBe("theme-a") // inherits the source's theme
  })

  it("walks a multi-hop chain to the first non-mirror output", () => {
    const outs = [
      output("main", "theme-a"),
      output("b", "theme-b", mirror("main")),
      output("c", "theme-c", mirror("b")),
    ]
    expect(resolveEffectiveOutput(outs, "c")?.id).toBe("main")
  })

  it("inherits the source's layer filter through a mirror", () => {
    const layers = {
      showContent: true,
      showProps: false,
      showAlerts: false,
      showCountdowns: true,
      showMediaLayer: true,
    }
    const outs = [
      output("main", "theme-a", { type: "layer-filter", layers }),
      output("alt", "theme-b", mirror("main")),
    ]
    const eff = resolveEffectiveOutput(outs, "alt")
    expect(eff?.contentSource).toEqual({ type: "layer-filter", layers })
  })

  it("falls back to the last valid output on a dangling source", () => {
    const outs = [output("alt", "theme-b", mirror("gone"))]
    // No "gone" output → stop at alt (renders with its own theme, no filter).
    expect(resolveEffectiveOutput(outs, "alt")?.id).toBe("alt")
  })

  it("does not loop forever on a self-referential mirror", () => {
    const outs = [output("solo", "theme-a", mirror("solo"))]
    expect(resolveEffectiveOutput(outs, "solo")?.id).toBe("solo")
  })

  it("does not loop forever on a cycle", () => {
    const outs = [
      output("a", "theme-a", mirror("b")),
      output("b", "theme-b", mirror("a")),
    ]
    // a → b → (a already visited) stop at b.
    expect(resolveEffectiveOutput(outs, "a")?.id).toBe("b")
  })
})
