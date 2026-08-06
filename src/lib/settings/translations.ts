/**
 * Pure helpers for the Bible-translation picker: the shape returned by the
 * backend and the grouping the UI renders (English first, then other
 * languages). No I/O — the gateway fetches, this shapes.
 */

export interface TranslationInfo {
  id: number
  abbreviation: string
  title: string
  language: string
}

export interface GroupedTranslations {
  english: TranslationInfo[]
  other: TranslationInfo[]
}

/** Split translations into English and everything else, preserving order. */
export function groupTranslations(
  translations: TranslationInfo[]
): GroupedTranslations {
  return {
    english: translations.filter((t) => t.language === "en"),
    other: translations.filter((t) => t.language !== "en"),
  }
}
