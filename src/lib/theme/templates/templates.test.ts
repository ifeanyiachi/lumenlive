import { describe, it, expect } from "vitest"
import type { ThemeType } from "@/types/theme"
import { isValidTheme, REQUIRED_PLACEHOLDERS } from "../model"
import {
  hasScriptureElement,
  hasTextRole,
  hasTimerElement,
} from "../model/roles"
import { createThemeFromTemplate, THEME_TYPES } from "."

// Deterministic id minter so template output is snapshot-stable.
function seqIds() {
  let n = 0
  return () => `id-${n++}`
}

describe("theme templates", () => {
  it("exposes the six types in canonical order, no 'general'", () => {
    expect(THEME_TYPES).toEqual([
      "scripture",
      "song",
      "countdown",
      "sermon",
      "overlay",
      "announcement",
    ])
  })

  it.each(THEME_TYPES)("%s template is a valid, editable seed", (type) => {
    const theme = createThemeFromTemplate(type, seqIds(), 1000)
    expect(theme.type).toBe(type)
    expect(theme.builtin).toBe(false)
    expect(theme.pinned).toBe(false)
    expect(theme.id).toBe("id-0")
    expect(theme.createdAt).toBe(1000)
    expect(theme.updatedAt).toBe(1000)
    // Seeded with exactly the placeholders its type requires.
    expect(isValidTheme(theme)).toBe(true)
  })

  it("scripture template carries a scripture placeholder", () => {
    const theme = createThemeFromTemplate("scripture", seqIds())
    expect(hasScriptureElement(theme.elements)).toBe(true)
  })

  it("song template carries a lyrics placeholder", () => {
    const theme = createThemeFromTemplate("song", seqIds())
    expect(hasTextRole(theme.elements, "lyrics")).toBe(true)
  })

  it("countdown template carries a timer placeholder", () => {
    const theme = createThemeFromTemplate("countdown", seqIds())
    expect(hasTimerElement(theme.elements)).toBe(true)
  })

  it("sermon template carries title and points placeholders", () => {
    const theme = createThemeFromTemplate("sermon", seqIds())
    expect(hasTextRole(theme.elements, "title")).toBe(true)
    expect(hasTextRole(theme.elements, "points")).toBe(true)
  })

  it("announcement template carries title and body placeholders", () => {
    const theme = createThemeFromTemplate("announcement", seqIds())
    expect(hasTextRole(theme.elements, "title")).toBe(true)
    expect(hasTextRole(theme.elements, "body")).toBe(true)
  })

  it("overlay template has a transparent background", () => {
    const theme = createThemeFromTemplate("overlay", seqIds())
    expect(theme.background.type).toBe("transparent")
  })

  it("every required placeholder spec is satisfied by its template", () => {
    for (const type of THEME_TYPES) {
      const theme = createThemeFromTemplate(type, seqIds())
      for (const spec of REQUIRED_PLACEHOLDERS[type as ThemeType]) {
        if (spec.kind === "scripture") {
          expect(hasScriptureElement(theme.elements)).toBe(true)
        } else if (spec.kind === "timer") {
          expect(hasTimerElement(theme.elements)).toBe(true)
        } else {
          expect(hasTextRole(theme.elements, spec.role)).toBe(true)
        }
      }
    }
  })

  it("is deterministic given the same id minter and clock", () => {
    const a = createThemeFromTemplate("scripture", seqIds(), 42)
    const b = createThemeFromTemplate("scripture", seqIds(), 42)
    expect(a).toEqual(b)
  })
})
