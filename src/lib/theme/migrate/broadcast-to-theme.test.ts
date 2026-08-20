import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { validateTheme } from "@/lib/theme/model"
import type { BroadcastTheme, ThemeElement } from "@/types/broadcast"
import { broadcastToTheme, categoryToType } from "./broadcast-to-theme"

const CLASSIC = BUILTIN_THEMES.find((t) => t.id === "builtin-classic-dark")!
const COUNTDOWN = BUILTIN_THEMES.find((t) => t.category === "countdown")!

describe("categoryToType", () => {
  it("maps each category to its intrinsic type", () => {
    expect(categoryToType("song")).toBe("song")
    expect(categoryToType("countdown")).toBe("countdown")
    expect(categoryToType("sermon")).toBe("sermon")
    expect(categoryToType("overlay")).toBe("overlay")
    expect(categoryToType("scripture")).toBe("scripture")
  })

  it("folds the removed 'general' and an absent category to scripture", () => {
    expect(categoryToType("general")).toBe("scripture")
    expect(categoryToType(undefined)).toBe("scripture")
  })
})

describe("broadcastToTheme", () => {
  it("produces a valid Theme for every built-in broadcast theme", () => {
    for (const bt of BUILTIN_THEMES) {
      const theme = broadcastToTheme(bt)
      // A migrated custom is never itself a built-in.
      expect(theme.builtin).toBe(false)
      // Structural validity: the type's required placeholder(s) are present.
      expect(validateTheme(theme).valid).toBe(true)
    }
  })

  it("carries identity, resolution, and pinned; bumps updatedAt to now", () => {
    const theme = broadcastToTheme(CLASSIC, 999)
    // The source id is preserved so stored themeId references survive (Phase 5c).
    expect(theme.id).toBe(CLASSIC.id)
    expect(theme.name).toBe(CLASSIC.name)
    expect(theme.pinned).toBe(CLASSIC.pinned)
    expect(theme.createdAt).toBe(CLASSIC.createdAt)
    expect(theme.updatedAt).toBe(999)
    expect(theme.resolution).toEqual(CLASSIC.resolution)
  })

  it("turns a scripture/general theme's verse region into a scripture placeholder", () => {
    const theme = broadcastToTheme(CLASSIC)
    expect(theme.type).toBe("scripture")
    const ph = theme.elements.find((e) => e.type === "scripture")
    expect(ph).toBeDefined()
    if (ph?.type === "scripture") {
      // Styled from the source verse typography.
      expect(ph.fontFamily).toBe(CLASSIC.verseText.fontFamily)
      expect(ph.fontSize).toBe(CLASSIC.verseText.fontSize)
      expect(ph.color).toBe(CLASSIC.verseText.color)
      expect(ph.referenceColor).toBe(CLASSIC.reference.color)
      // Content is empty — live verse flows in at go-live.
      expect(ph.verseText).toBe("")
      expect(ph.reference).toBe("")
    }
  })

  it("turns a countdown theme's verse region into a timer placeholder", () => {
    const theme = broadcastToTheme(COUNTDOWN)
    expect(theme.type).toBe("countdown")
    const timer = theme.elements.find((e) => e.type === "timer")
    expect(timer).toBeDefined()
    if (timer?.type === "timer") {
      expect(timer.fontFamily).toBe(COUNTDOWN.verseText.fontFamily)
      expect(timer.color).toBe(COUNTDOWN.verseText.color)
      expect(timer.mode).toBe("duration")
    }
  })

  it("forces an overlay theme transparent with no content placeholder", () => {
    const bt: BroadcastTheme = { ...CLASSIC, category: "overlay" }
    const theme = broadcastToTheme(bt)
    expect(theme.type).toBe("overlay")
    expect(theme.background.type).toBe("transparent")
    expect(
      theme.elements.some((e) => e.type === "scripture" || e.type === "timer")
    ).toBe(false)
  })

  it("converts decorative elements from theme-resolution px to frame percent, in layer order", () => {
    const img: ThemeElement = {
      id: "logo",
      name: "logo",
      x: 960,
      y: 540,
      width: 192,
      height: 108,
      visible: true,
      locked: false,
      type: "image",
      image: {
        url: "logo.png",
        fit: "contain",
        opacity: 1,
        borderRadius: 0,
      },
    }
    const bt: BroadcastTheme = {
      ...CLASSIC,
      resolution: { width: 1920, height: 1080 },
      elements: [img],
      layerOrder: ["logo"],
    }
    const theme = broadcastToTheme(bt)
    const el = theme.elements.find((e) => e.id === "logo")
    expect(el).toBeDefined()
    if (el?.type === "image") {
      // 960/1920 = 50%, 540/1080 = 50%, 192/1920 = 10%, 108/1080 = 10%.
      expect(el.x).toBe(50)
      expect(el.y).toBe(50)
      expect(el.width).toBe(10)
      expect(el.height).toBe(10)
    }
    // Decoration precedes the content placeholder (drawn behind it).
    const idxImg = theme.elements.findIndex((e) => e.id === "logo")
    const idxPh = theme.elements.findIndex((e) => e.type === "scripture")
    expect(idxImg).toBeLessThan(idxPh)
  })

  it("maps a slide-direction transition to a push, and none → cut/undefined", () => {
    const slid: BroadcastTheme = {
      ...CLASSIC,
      transition: {
        type: "slide",
        duration: 400,
        easing: "ease-in-out",
        direction: "right",
      },
    }
    expect(broadcastToTheme(slid).transition).toEqual({
      type: "push-right",
      duration: 400,
    })

    const none: BroadcastTheme = {
      ...CLASSIC,
      transition: { type: "none", duration: 0, easing: "linear", direction: "up" },
    }
    expect(broadcastToTheme(none).transition).toBeUndefined()
  })

  it("does not share mutable structure with the source (deep copy)", () => {
    const theme = broadcastToTheme(CLASSIC)
    theme.resolution.width = 1
    expect(CLASSIC.resolution.width).not.toBe(1)
  })
})
