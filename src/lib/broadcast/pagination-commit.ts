import type {
  VerseRenderData,
  BroadcastOutput,
  BroadcastTheme,
} from "@/types/broadcast"
import { findOutput, resolveThemeId } from "@/lib/broadcast/output-selectors"
import { paginateVerse } from "@/lib/verse-pagination"

/**
 * Resolve the ordered pages for a live verse at commit time.
 *
 * Long multi-verse blocks are paginated once — at the main output's readable
 * floor — into pages the operator steps through; single-page verses return
 * `[liveVerse]` and a `null` verse returns `[]`. Extracted verbatim from
 * `commitVerseLive` so the store just calls this and stores the result.
 */
export function resolveVersePages(
  liveVerse: VerseRenderData | null,
  outputs: BroadcastOutput[],
  themes: BroadcastTheme[]
): VerseRenderData[] {
  if (!liveVerse) return []
  const main = findOutput(outputs, "main")
  const themeId = resolveThemeId(outputs, "main")
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]
  const autoFit = main?.verseAutoFit ?? true
  if (theme && autoFit && (main?.paginateLongVerses ?? true)) {
    return paginateVerse(liveVerse, theme, {
      minFontSize: main?.minVerseFontSize ?? 40,
      enabled: true,
    })
  }
  return [liveVerse]
}
