import { useMemo } from "react"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { buildBaseBackdropSlide } from "@/lib/theme/render"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import type { BaseBackground } from "@/types/broadcast"

interface BasePreviewProps {
  /** The output's theme id (legacy namespace); resolved via the alias. */
  themeId: string | undefined
  baseBackground: BaseBackground | null
  className?: string
}

/**
 * Operator preview of the central base/master backdrop on the slide path (flip RF3c),
 * shown on Clear. Mirrors the audience output's `paintBaseTheme` (RF3a): resolves the
 * base {@link import("@/types/theme").Theme} from the new typed store and draws it via
 * {@link SlideCanvas} (background + branding, no content) — instead of the legacy
 * `renderVerse`/`BroadcastTheme` path.
 */
export function BasePreview({
  themeId,
  baseBackground,
  className,
}: BasePreviewProps) {
  const customThemes = useThemesStore((s) => s.customThemes)

  const slide = useMemo(
    () =>
      buildBaseBackdropSlide(
        themeId,
        baseBackground,
        buildThemeRegistry(customThemes),
        () => "preview-base"
      ),
    [customThemes, themeId, baseBackground]
  )

  if (!slide) return null
  return <SlideCanvas slide={slide} className={className} />
}
