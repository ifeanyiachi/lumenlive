import { describe, expect, it } from "vitest"
import {
  findOutput,
  resolveThemeId,
  updateOutputInArray,
} from "./output-selectors"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastOutput } from "@/types"

function output(id: string, themeId: string): BroadcastOutput {
  return {
    id,
    name: id,
    themeId,
    mode: "normal",
    contentSource: { type: "independent" },
    enabled: true,
  }
}

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
