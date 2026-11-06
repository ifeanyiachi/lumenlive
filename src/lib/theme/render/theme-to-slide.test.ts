import { describe, it, expect } from "vitest"
import { SCRIPTURE_BUILTIN, SONG_BUILTIN } from "../builtins"
import { themeToSlide } from "./theme-to-slide"

let counter = 0
const newId = () => `sid-${counter++}`

describe("themeToSlide", () => {
  it("projects a theme to a slide, carrying background + elements", () => {
    counter = 0
    const slide = themeToSlide(SONG_BUILTIN, newId, 42)
    expect(slide.id).toBe("sid-0")
    expect(slide.name).toBe(SONG_BUILTIN.name)
    expect(slide.background).toEqual(SONG_BUILTIN.background)
    expect(slide.elements).toEqual(SONG_BUILTIN.elements)
    expect(slide.createdAt).toBe(42)
    expect(slide.updatedAt).toBe(42)
  })

  it("deep-clones so mutating the slide never touches the theme", () => {
    counter = 0
    const slide = themeToSlide(SCRIPTURE_BUILTIN, newId)
    ;(slide.background as { color?: string }).color = "#ff0000"
    slide.elements[0].id = "mutated"
    expect(SCRIPTURE_BUILTIN.background).not.toHaveProperty("color", "#ff0000")
    expect(SCRIPTURE_BUILTIN.elements[0].id).toBe("scripture-placeholder")
  })

  it("omits transition when the theme has none", () => {
    counter = 0
    const slide = themeToSlide(SONG_BUILTIN, newId)
    expect(slide.transition).toBeUndefined()
  })
})
