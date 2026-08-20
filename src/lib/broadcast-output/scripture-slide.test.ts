import { afterEach, describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import { renderVerse } from "@/lib/verse-renderer"
import { drawSlideElements } from "@/lib/slide-renderer"
import {
  recordingCtx,
  type TextDraw,
} from "@/lib/theme/present/parity/recording-ctx"
import { BUILTIN_THEMES as NEW_BUILTINS } from "@/lib/theme/builtins"
import { presentScripture } from "@/lib/theme/present"
import {
  buildScriptureSlide,
  buildScriptureContent,
  buildBaseSlide,
  resetScriptureSlideCache,
  type ScriptureAutoFit,
} from "./scripture-slide"

/**
 * The flip-F5 byte-identity gate.
 *
 * The compositor's live scripture branch used to call `renderVerse(theme, verse)`.
 * Flip F5 splits that into chrome (`renderVerse(theme, null)`) + verse/reference through
 * the slide-path payload (`drawSlideElements` over {@link buildScriptureSlide}'s style-only
 * placeholder). This suite drives BOTH the old single call and the new two-pass hybrid
 * through the same recording context and asserts they emit the *same* set of text draws —
 * at the same coordinates, font, and colour — so the flip changes no pixel.
 *
 * Comparison is by *position-sorted* draw records, not raw order: the verse renderer
 * interleaves the verse/reference regions with decorative elements per `layerOrder`,
 * whereas the payload path draws verse-then-reference — but those regions are disjoint,
 * so a reordering is pixel-invisible. The coordinates match exactly because both paths
 * run the identical layout (`computeVerseLayoutMetrics`) over the same theme + surface.
 */

const RENDER_W = 1920
const RENDER_H = 1080

const NO_AUTOFIT: ScriptureAutoFit = {
  verseAutoFit: false,
  maxVerseScale: 1,
  minVerseFontSize: 40,
}
const AUTOFIT: ScriptureAutoFit = {
  verseAutoFit: true,
  maxVerseScale: 1.5,
  minVerseFontSize: 40,
}

const NUMBERED: VerseRenderData = {
  reference: "John 3:16",
  segments: [
    { verseNumber: 16, text: "For God so loved the world that he gave" },
  ],
}
const MULTI_VERSE: VerseRenderData = {
  reference: "Psalm 1:1-2",
  segments: [
    { verseNumber: 1, text: "Blessed is the one who walks not in the counsel" },
    { verseNumber: 2, text: "but his delight is in the law of the Lord" },
  ],
}

/** A stable ordering that absorbs the pixel-invisible verse-vs-reference draw order. */
function sortDraws(draws: TextDraw[]): TextDraw[] {
  return [...draws].sort(
    (a, b) =>
      a.y - b.y ||
      a.x - b.x ||
      a.font.localeCompare(b.font) ||
      a.kind.localeCompare(b.kind) ||
      a.text.localeCompare(b.text)
  )
}

/** Draws from the OLD path: one `renderVerse(theme, verse)` call. */
function oldDraws(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  autoFit: ScriptureAutoFit
): TextDraw[] {
  const { ctx, draws } = recordingCtx()
  renderVerse(ctx, theme, verse, {
    scale: 1,
    surface: { width: RENDER_W, height: RENDER_H },
    verseAutoFit: autoFit.verseAutoFit,
    maxVerseScale: autoFit.maxVerseScale,
    minVerseFontSize: autoFit.minVerseFontSize,
  })
  return draws
}

/** Draws from the NEW hybrid: chrome via renderVerse(null) + verse via the slide path. */
function newDraws(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  autoFit: ScriptureAutoFit
): TextDraw[] {
  const { ctx, draws } = recordingCtx()
  renderVerse(ctx, theme, null, {
    scale: 1,
    surface: { width: RENDER_W, height: RENDER_H },
    verseAutoFit: autoFit.verseAutoFit,
    maxVerseScale: autoFit.maxVerseScale,
    minVerseFontSize: autoFit.minVerseFontSize,
  })
  const { slide, scriptureContent } = buildScriptureSlide(theme, verse, autoFit)
  drawSlideElements(ctx, slide, RENDER_W, RENDER_H, undefined, {
    scriptureContent,
  })
  return draws
}

afterEach(() => resetScriptureSlideCache())

describe("buildScriptureSlide", () => {
  it("keys the payload by the carrier element's id", () => {
    const theme = BUILTIN_THEMES[0]
    const { slide, scriptureContent } = buildScriptureSlide(
      theme,
      NUMBERED,
      NO_AUTOFIT
    )
    expect(slide.elements).toHaveLength(1)
    const el = slide.elements[0]
    expect(el.type).toBe("scripture")
    expect(scriptureContent.has(el.id)).toBe(true)
    const payload = scriptureContent.get(el.id)!
    expect(payload.verse).toBe(NUMBERED)
    expect(payload.style).toBe(theme)
    // surface is derived from the draw canvas — never baked into the payload.
    expect(payload.options && "surface" in payload.options).toBe(false)
  })

  it("memoises on (theme, verse, auto-fit) — returns the same object per frame", () => {
    const theme = BUILTIN_THEMES[0]
    const a = buildScriptureSlide(theme, NUMBERED, NO_AUTOFIT)
    const b = buildScriptureSlide(theme, NUMBERED, NO_AUTOFIT)
    expect(b).toBe(a)
    // A different verse rebuilds.
    const c = buildScriptureSlide(theme, MULTI_VERSE, NO_AUTOFIT)
    expect(c).not.toBe(a)
    // A different auto-fit rebuilds.
    const d = buildScriptureSlide(theme, MULTI_VERSE, AUTOFIT)
    expect(d).not.toBe(c)
  })

  it("carries the verse for any theme category (verse always gets a carrier)", () => {
    // Even a non-scripture-categorised theme produces a scripture carrier, matching
    // renderVerse, which draws the pushed verse regardless of theme category.
    for (const bt of BUILTIN_THEMES) {
      const { slide } = buildScriptureSlide(bt, NUMBERED, NO_AUTOFIT)
      expect(slide.elements[0]?.type).toBe("scripture")
      resetScriptureSlideCache()
    }
  })
})

describe("buildScriptureContent (flip RF2 — slide-path scripture payload)", () => {
  const scriptureBuiltin = NEW_BUILTINS.find((t) => t.type === "scripture")!

  it("keys the payload by the presented slide's scripture placeholder id", () => {
    const [presented] = presentScripture(
      scriptureBuiltin,
      { type: "scripture", verse: NUMBERED },
      () => "live-scripture"
    )
    const el = presented.slide.elements.find((e) => e.type === "scripture")!
    const map = buildScriptureContent(presented.slide, NUMBERED, NO_AUTOFIT)
    expect(map.has(el.id)).toBe(true)
    const payload = map.get(el.id)!
    expect(payload.verse).toBe(NUMBERED)
    // The style is rebuilt from the placeholder (RF1), not a pushed BroadcastTheme.
    expect(payload.style.verseText.fontFamily).toBe(
      (el as { fontFamily: string }).fontFamily
    )
    expect(payload.options && "surface" in payload.options).toBe(false)
  })

  it("memoises on (slide, verse, auto-fit)", () => {
    const [presented] = presentScripture(
      scriptureBuiltin,
      { type: "scripture", verse: NUMBERED },
      () => "live-scripture"
    )
    const a = buildScriptureContent(presented.slide, NUMBERED, NO_AUTOFIT)
    expect(buildScriptureContent(presented.slide, NUMBERED, NO_AUTOFIT)).toBe(a)
    expect(
      buildScriptureContent(presented.slide, MULTI_VERSE, NO_AUTOFIT)
    ).not.toBe(a)
  })

  it("is empty when the slide has no scripture element", () => {
    const slide = {
      id: "s",
      name: "s",
      background: { type: "transparent" as const },
      elements: [],
      createdAt: 0,
      updatedAt: 0,
    }
    expect(buildScriptureContent(slide, NUMBERED, NO_AUTOFIT).size).toBe(0)
  })
})

describe("buildBaseSlide (flip RF3a — base backdrop on the slide path)", () => {
  const scriptureBuiltin = NEW_BUILTINS.find((t) => t.type === "scripture")!

  it("projects a base Theme to a renderable slide, memoised on theme identity", () => {
    const a = buildBaseSlide(scriptureBuiltin)
    expect(a.background).toEqual(scriptureBuiltin.background)
    expect(a.elements.length).toBe(scriptureBuiltin.elements.length)
    // Memoised: same theme → same slide object.
    expect(buildBaseSlide(scriptureBuiltin)).toBe(a)
    // A different theme rebuilds.
    const overlay = NEW_BUILTINS.find((t) => t.type === "overlay")!
    expect(buildBaseSlide(overlay)).not.toBe(a)
    resetScriptureSlideCache()
  })
})

describe("flip F5 byte-identity — hybrid split == renderVerse(theme, verse)", () => {
  it("holds for a numbered verse across all built-ins (no auto-fit)", () => {
    for (const bt of BUILTIN_THEMES) {
      const oldD = sortDraws(oldDraws(bt, NUMBERED, NO_AUTOFIT))
      const newD = sortDraws(newDraws(bt, NUMBERED, NO_AUTOFIT))
      resetScriptureSlideCache()
      expect(newD, `theme ${bt.id}`).toEqual(oldD)
      // Sanity: the verse actually drew (not two empty passes agreeing).
      expect(oldD.length).toBeGreaterThan(0)
    }
  })

  it("holds for a multi-verse passage across all built-ins", () => {
    for (const bt of BUILTIN_THEMES) {
      const oldD = sortDraws(oldDraws(bt, MULTI_VERSE, NO_AUTOFIT))
      const newD = sortDraws(newDraws(bt, MULTI_VERSE, NO_AUTOFIT))
      resetScriptureSlideCache()
      expect(newD, `theme ${bt.id}`).toEqual(oldD)
    }
  })

  it("holds under auto-fit + surface scaling across all built-ins", () => {
    for (const bt of BUILTIN_THEMES) {
      const oldD = sortDraws(oldDraws(bt, NUMBERED, AUTOFIT))
      const newD = sortDraws(newDraws(bt, NUMBERED, AUTOFIT))
      resetScriptureSlideCache()
      expect(newD, `theme ${bt.id}`).toEqual(oldD)
    }
  })

  it("emits the verse number as a token on both paths (the foothold)", () => {
    const bt = BUILTIN_THEMES[0]
    const oldD = oldDraws(bt, NUMBERED, NO_AUTOFIT)
    const newD = newDraws(bt, NUMBERED, NO_AUTOFIT)
    // Only assert when the theme actually shows verse numbers.
    if (bt.verseNumbers.visible) {
      expect(oldD.map((d) => d.text)).toContain("16")
      expect(newD.map((d) => d.text)).toContain("16")
    }
  })
})
