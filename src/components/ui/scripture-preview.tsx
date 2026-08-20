import { useMemo } from "react"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { resolveScriptureTheme } from "@/lib/theme/resolve"
import { presentScripture } from "@/lib/theme/present"
import {
  scriptureElementToVerseStyle,
  type ScriptureRenderPayload,
} from "@/lib/slide-renderer"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import type { VerseRenderData } from "@/types/broadcast"
import type { SlideScriptureElement } from "@/types/slide"

interface ScripturePreviewProps {
  /** The output's theme id (legacy namespace); resolved via the alias to a scripture Theme. */
  themeId: string | undefined
  verse: VerseRenderData | null
  /** Mirror the live output's verse auto-fit so the preview matches the audience. */
  verseAutoFit?: boolean
  maxVerseScale?: number
  minVerseFontSize?: number
  className?: string
}

const EMPTY_VERSE: VerseRenderData = { reference: "", segments: [] }

/**
 * Operator scripture preview on the slide path (themeredo.md, flip RF3c).
 *
 * The audience output presents a live verse as a scripture slide and fills its
 * style-only placeholder through the verse-renderer draw passes (RF2). This renders
 * the *same* thing operator-side — resolving the scripture {@link import("@/types/theme").Theme}
 * from the new typed store, presenting the verse, and drawing it through {@link SlideCanvas}
 * with a `scriptureContent` payload — so the preview matches the output instead of the
 * legacy `renderVerse`/`BroadcastTheme` path (`CanvasVerse`).
 *
 * The presented slide is style-only (verse-independent), so it is memoised on the theme;
 * only the payload changes per verse.
 */
export function ScripturePreview({
  themeId,
  verse,
  verseAutoFit,
  maxVerseScale,
  minVerseFontSize,
  className,
}: ScripturePreviewProps) {
  const customThemes = useThemesStore((s) => s.customThemes)

  const theme = useMemo(() => {
    const themes = buildThemeRegistry(customThemes)
    return (
      resolveScriptureTheme(themeId, themes) ??
      themes.find((t) => t.type === "scripture")
    )
  }, [customThemes, themeId])

  const slide = useMemo(
    () =>
      theme
        ? presentScripture(
            theme,
            { type: "scripture", verse: EMPTY_VERSE },
            () => "preview-scripture"
          )[0].slide
        : null,
    [theme]
  )

  const scriptureContent = useMemo(() => {
    if (!slide || !verse) return undefined
    const el = slide.elements.find((e) => e.type === "scripture") as
      | SlideScriptureElement
      | undefined
    if (!el) return undefined
    const map = new Map<string, ScriptureRenderPayload>()
    map.set(el.id, {
      verse,
      style: scriptureElementToVerseStyle(el),
      options: {
        scale: 1,
        verseAutoFit: verseAutoFit ?? false,
        maxVerseScale: maxVerseScale ?? 1.5,
        minVerseFontSize: minVerseFontSize ?? 40,
      },
    })
    return map
  }, [slide, verse, verseAutoFit, maxVerseScale, minVerseFontSize])

  if (!slide) return null
  return (
    <SlideCanvas
      slide={slide}
      scriptureContent={scriptureContent}
      className={className}
    />
  )
}
