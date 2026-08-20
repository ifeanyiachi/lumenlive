import { describe, expect, it } from "vitest"
import { validateTheme } from "@/lib/theme/model"
import type {
  SlideScriptureElement,
  SlideTextElement,
  SlideTheme,
} from "@/types/slide"
import { slideCategoryToType, slideThemeToTheme } from "./slide-theme-to-theme"

let counter = 0
const newId = () => `id-${counter++}`

const text = (
  over: Partial<Omit<SlideTextElement, "id">> = {}
): Omit<SlideTextElement, "id"> => ({
  type: "text",
  x: 10,
  y: 30,
  width: 80,
  height: 40,
  text: "",
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 600,
  bold: false,
  italic: false,
  underline: false,
  color: "#ffffff",
  horizontalAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.4,
  textTransform: "none",
  ...over,
})

const scripture = (): Omit<SlideScriptureElement, "id"> => ({
  type: "scripture",
  x: 10,
  y: 20,
  width: 80,
  height: 60,
  reference: "",
  verseText: "",
  translation: "",
  fontFamily: "Inter",
  fontSize: 40,
  fontWeight: 400,
  bold: false,
  italic: false,
  color: "#ffffff",
  horizontalAlign: "center",
  verticalAlign: "middle",
  lineHeight: 1.5,
  referenceFontSize: 24,
  referenceColor: "#cccccc",
})

const songTheme = (over: Partial<SlideTheme> = {}): SlideTheme => ({
  id: "st-song",
  name: "My Song Look",
  category: "song",
  builtin: false,
  variants: [
    {
      layout: "content-only",
      background: { type: "solid", color: "#101010" },
      elements: [text({ width: 80, height: 40 })],
    },
  ],
  ...over,
})

describe("slideCategoryToType", () => {
  it("maps song/general to song and scripture to scripture", () => {
    expect(slideCategoryToType("song")).toBe("song")
    expect(slideCategoryToType("general")).toBe("song")
    expect(slideCategoryToType("scripture")).toBe("scripture")
  })
})

describe("slideThemeToTheme", () => {
  it("migrates a song theme to a valid song Theme with a lyrics placeholder", () => {
    const theme = slideThemeToTheme(songTheme(), newId, 5)
    expect(theme.type).toBe("song")
    // Source id preserved so stored references survive the store merge (Phase 5c).
    expect(theme.id).toBe("st-song")
    expect(theme.builtin).toBe(false)
    expect(theme.createdAt).toBe(5)
    expect(theme.updatedAt).toBe(5)
    expect(validateTheme(theme).valid).toBe(true)
    const lyrics = theme.elements.find(
      (e) => e.type === "text" && e.role === "lyrics"
    )
    expect(lyrics).toBeDefined()
    // Background lifted from the representative variant.
    expect(theme.background).toEqual({ type: "solid", color: "#101010" })
  })

  it("tags the largest untagged text element as the lyrics placeholder", () => {
    const theme = slideThemeToTheme(
      songTheme({
        variants: [
          {
            layout: "content-only",
            background: { type: "solid", color: "#000" },
            elements: [
              text({ width: 20, height: 10, text: "small" }),
              text({ width: 90, height: 60, text: "big" }),
            ],
          },
        ],
      }),
      newId
    )
    const tagged = theme.elements.filter(
      (e) => e.type === "text" && e.role === "lyrics"
    )
    expect(tagged).toHaveLength(1)
    expect((tagged[0] as SlideTextElement).text).toBe("big")
  })

  it("keeps a scripture element for a scripture theme", () => {
    const st = songTheme({
      id: "st-scripture",
      category: "scripture",
      variants: [
        {
          layout: "scripture",
          background: { type: "solid", color: "#000" },
          elements: [scripture()],
        },
      ],
    })
    const theme = slideThemeToTheme(st, newId)
    expect(theme.type).toBe("scripture")
    expect(validateTheme(theme).valid).toBe(true)
    expect(theme.elements.some((e) => e.type === "scripture")).toBe(true)
  })

  it("synthesises a lyrics placeholder when the variant has no text element", () => {
    const st = songTheme({
      variants: [
        {
          layout: "content-only",
          background: { type: "solid", color: "#000" },
          elements: [],
        },
      ],
    })
    const theme = slideThemeToTheme(st, newId)
    expect(validateTheme(theme).valid).toBe(true)
    expect(
      theme.elements.some((e) => e.type === "text" && e.role === "lyrics")
    ).toBe(true)
  })

  it("prefers the content-only variant over a blank one", () => {
    const st = songTheme({
      variants: [
        {
          layout: "blank",
          background: { type: "solid", color: "#blank" },
          elements: [],
        },
        {
          layout: "content-only",
          background: { type: "solid", color: "#content" },
          elements: [text()],
        },
      ],
    })
    const theme = slideThemeToTheme(st, newId)
    expect(theme.background).toEqual({ type: "solid", color: "#content" })
  })

  it("assigns fresh element ids and shares no structure with the source", () => {
    const src = songTheme()
    const theme = slideThemeToTheme(src, () => "fixed-el", 0)
    expect(theme.elements[0].id).toBe("fixed-el")
    // Mutating the migrated theme must not reach back into the source variant.
    ;(theme.elements[0] as SlideTextElement).text = "mutated"
    expect(
      (src.variants[0].elements[0] as Omit<SlideTextElement, "id">).text
    ).toBe("")
  })
})
