import { afterEach, describe, expect, it } from "vitest"
import type { VerseRenderData } from "@/types/broadcast"
import { BUILTIN_THEMES as NEW_BUILTINS } from "@/lib/theme/builtins"
import { presentScripture } from "@/lib/theme/present"
import {
  buildScriptureContent,
  buildBaseSlide,
  resetScriptureSlideCache,
  type ScriptureAutoFit,
} from "./scripture-slide"

const NO_AUTOFIT: ScriptureAutoFit = {
  verseAutoFit: false,
  maxVerseScale: 1,
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

afterEach(() => resetScriptureSlideCache())

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
