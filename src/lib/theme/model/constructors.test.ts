import { describe, it, expect } from "vitest"
import {
  createTheme,
  updateTheme,
  DEFAULT_THEME_RESOLUTION,
} from "./constructors"

let counter = 0
const newId = () => `id-${counter++}`

describe("createTheme", () => {
  it("builds a theme with injected id/now and sensible defaults", () => {
    counter = 0
    const t = createTheme({ name: "My Song", type: "song" }, newId, 123)
    expect(t.id).toBe("id-0")
    expect(t.name).toBe("My Song")
    expect(t.type).toBe("song")
    expect(t.builtin).toBe(false)
    expect(t.pinned).toBe(false)
    expect(t.createdAt).toBe(123)
    expect(t.updatedAt).toBe(123)
    expect(t.resolution).toEqual(DEFAULT_THEME_RESOLUTION)
    expect(t.background).toEqual({ type: "solid", color: "#1a1a2e" })
    expect(t.elements).toEqual([])
  })

  it("honours provided background/elements/flags/resolution", () => {
    counter = 0
    const t = createTheme(
      {
        name: "Overlay",
        type: "overlay",
        background: { type: "transparent" },
        elements: [],
        builtin: true,
        pinned: true,
        resolution: { width: 1280, height: 720 },
      },
      newId
    )
    expect(t.background).toEqual({ type: "transparent" })
    expect(t.builtin).toBe(true)
    expect(t.pinned).toBe(true)
    expect(t.resolution).toEqual({ width: 1280, height: 720 })
    expect(t.createdAt).toBe(0)
  })

  it("does not share the default resolution object between instances", () => {
    counter = 0
    const a = createTheme({ name: "a", type: "song" }, newId)
    const b = createTheme({ name: "b", type: "song" }, newId)
    expect(a.resolution).not.toBe(b.resolution)
  })
})

describe("updateTheme", () => {
  it("applies a patch and bumps updatedAt, keeping identity fields", () => {
    counter = 0
    const t = createTheme({ name: "orig", type: "song" }, newId, 1)
    const next = updateTheme(t, { name: "renamed", pinned: true }, 99)
    expect(next.name).toBe("renamed")
    expect(next.pinned).toBe(true)
    expect(next.updatedAt).toBe(99)
    // Identity preserved.
    expect(next.id).toBe(t.id)
    expect(next.type).toBe("song")
    expect(next.createdAt).toBe(1)
  })
})
