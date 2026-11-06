import type { VerseRenderData, BroadcastOutput } from "@/types/broadcast"
import type { Theme } from "@/types/theme"
import type { SlideScriptureElement } from "@/types/slide"
import { findOutput, resolveThemeId } from "@/lib/broadcast/output-selectors"
import { resolveScriptureTheme } from "@/lib/theme/resolve"
import { scriptureElementToVerseStyle } from "@/lib/slide-renderer"
import { paginateVerse } from "@/lib/verse-pagination"

/**
 * Resolve the ordered pages for a live verse at commit time.
 *
 * Long multi-verse blocks are paginated once — at the main output's readable
 * floor — into pages the operator steps through; single-page verses return
 * `[liveVerse]` and a `null` verse returns `[]`. Extracted verbatim from
 * `commitVerseLive` so the store just calls this and stores the result.
 *
 * Measurement runs against the output's scripture {@link Theme}'s placeholder
 * styling (as a `VerseStyle`, resolved from the typed store), matching how the
 * live scripture is actually laid out.
 */
export function resolveVersePages(
  liveVerse: VerseRenderData | null,
  outputs: BroadcastOutput[],
  themes: readonly Theme[]
): VerseRenderData[] {
  if (!liveVerse) return []
  const main = findOutput(outputs, "main")
  const themeId = resolveThemeId(outputs, "main")
  const theme =
    resolveScriptureTheme(themeId, themes) ??
    themes.find((t) => t.type === "scripture")
  const el = theme?.elements.find((e) => e.type === "scripture") as
    SlideScriptureElement | undefined
  const autoFit = main?.verseAutoFit ?? true
  if (el && autoFit && (main?.paginateLongVerses ?? true)) {
    return paginateVerse(liveVerse, scriptureElementToVerseStyle(el), {
      minFontSize: main?.minVerseFontSize ?? 40,
      enabled: true,
    })
  }
  return [liveVerse]
}
