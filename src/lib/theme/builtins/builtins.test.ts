import { describe, it, expect } from "vitest"
import type { ThemeType } from "@/types/theme"
import { BUILTIN_THEMES, BUILTIN_THEME_BY_TYPE } from "./index"

const ALL_TYPES: ThemeType[] = [
  "scripture",
  "song",
  "countdown",
  "sermon",
  "overlay",
  "announcement",
]

describe("BUILTIN_THEMES", () => {
  it("covers every type at least once, with unique ids", () => {
    // One primary per type, plus the extra Song look library — so the catalog
    // is >= ALL_TYPES, and the Song type is represented several times.
    expect(new Set(BUILTIN_THEMES.map((t) => t.type))).toEqual(
      new Set(ALL_TYPES)
    )
    expect(BUILTIN_THEMES.length).toBeGreaterThanOrEqual(ALL_TYPES.length)
    const ids = BUILTIN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("indexes exactly one primary per type in BUILTIN_THEME_BY_TYPE", () => {
    expect(new Set(Object.keys(BUILTIN_THEME_BY_TYPE))).toEqual(
      new Set(ALL_TYPES)
    )
  })

  it("marks every built-in as builtin and deterministic (createdAt 0)", () => {
    for (const t of BUILTIN_THEMES) {
      expect(t.builtin).toBe(true)
      expect(t.createdAt).toBe(0)
      expect(t.updatedAt).toBe(0)
    }
  })

  it("mints stable, unique element ids within each theme", () => {
    for (const t of BUILTIN_THEMES) {
      const ids = t.elements.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it("BUILTIN_THEME_BY_TYPE indexes the same objects", () => {
    for (const type of ALL_TYPES) {
      expect(BUILTIN_THEME_BY_TYPE[type].type).toBe(type)
      expect(BUILTIN_THEMES).toContain(BUILTIN_THEME_BY_TYPE[type])
    }
  })

  it("matches the committed snapshot", () => {
    expect(BUILTIN_THEMES).toMatchSnapshot()
  })
})
