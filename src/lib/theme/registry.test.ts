import { describe, it, expect } from "vitest"
import type { Theme } from "@/types/theme"
import { BUILTIN_THEMES } from "./builtins"
import { buildThemeRegistry, findThemeById } from "./registry"

const custom: Theme = {
  id: "custom-1",
  name: "Mine",
  type: "song",
  builtin: false,
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  resolution: { width: 1920, height: 1080 },
  background: { type: "solid", color: "#000" },
  elements: [],
}

describe("buildThemeRegistry", () => {
  it("returns built-ins first, then customs", () => {
    const reg = buildThemeRegistry([custom])
    expect(reg).toHaveLength(BUILTIN_THEMES.length + 1)
    expect(reg.slice(0, BUILTIN_THEMES.length)).toEqual(BUILTIN_THEMES)
    expect(reg[reg.length - 1]).toBe(custom)
  })

  it("returns just the built-ins with no customs", () => {
    expect(buildThemeRegistry([])).toEqual(BUILTIN_THEMES)
  })
})

describe("findThemeById", () => {
  it("finds built-ins and customs by id", () => {
    expect(findThemeById([custom], "builtin-song")?.type).toBe("song")
    expect(findThemeById([custom], "custom-1")).toBe(custom)
    expect(findThemeById([custom], "nope")).toBeUndefined()
  })
})
