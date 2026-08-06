/**
 * Presentation-only enrichment for Bible resources in the store UI.
 *
 * The catalog manifest carries the load-bearing facts (id, title, language,
 * license, download size, checksum). It intentionally does NOT carry display
 * copy — a one-line description, a per-translation badge color, a "featured"
 * star, or the verse count — because none of that affects install correctness.
 * This module supplies that chrome for the translations we ship, keyed by
 * abbreviation (case-insensitive).
 *
 * Pure data + lookup, no I/O. Unknown translations (e.g. a future one added to
 * R2 that isn't listed here) degrade gracefully: `bibleDisplayMeta` returns a
 * deterministic fallback color and leaves `verses`/`description` undefined, so
 * a card still renders title + language + size + install action.
 *
 * Verse counts are the real per-translation totals (from the build pipeline's
 * `temp-bible/index.json`); they're stable facts for these fixed editions.
 */

export interface BibleDisplayMeta {
  /** Total verse count, when known. */
  verses?: number
  /** One-line description shown under the metadata row. */
  description?: string
  /** Tailwind background class for the abbreviation badge. */
  badgeClass: string
  /** Whether to show a "featured" star next to the title. */
  featured: boolean
}

interface DisplayEntry {
  verses: number
  description: string
  badgeClass: string
  featured?: boolean
}

/**
 * Per-translation display data, keyed by uppercase abbreviation. Verse counts
 * match the shipped editions exactly.
 */
const DISPLAY: Record<string, DisplayEntry> = {
  KJV: {
    verses: 31102,
    description:
      "The classic 1611 King James translation, widely used in churches worldwide.",
    badgeClass: "bg-orange-500",
    featured: true,
  },
  ESV: {
    verses: 31103,
    description:
      "A word-for-word translation combining accuracy with literary quality.",
    badgeClass: "bg-amber-600",
    featured: true,
  },
  NIV: {
    verses: 31103,
    description:
      "A balanced, readable translation blending accuracy with everyday clarity.",
    badgeClass: "bg-red-600",
  },
  NKJV: {
    verses: 31102,
    description:
      "A modern update of the classic KJV, retaining traditional language style.",
    badgeClass: "bg-teal-600",
  },
  NASB: {
    verses: 31103,
    description: "A highly literal translation prized for precision and study.",
    badgeClass: "bg-blue-600",
  },
  NLT: {
    verses: 31080,
    description:
      "A thought-for-thought translation in clear, contemporary English.",
    badgeClass: "bg-yellow-600",
  },
  AMP: {
    verses: 31103,
    description:
      "Includes amplified phrases to bring out the full meaning of the original text.",
    badgeClass: "bg-violet-600",
  },
  SPARV: {
    verses: 31102,
    description: "The classic Spanish Reina-Valera 1909 revision.",
    badgeClass: "bg-rose-600",
  },
  FREJND: {
    verses: 31172,
    description: "J.N. Darby's precise 1885 French translation.",
    badgeClass: "bg-indigo-600",
  },
  PORBLIVRE: {
    verses: 31104,
    description: "A free, public-domain Portuguese Bible.",
    badgeClass: "bg-emerald-600",
  },
}

/** Deterministic fallback badge palette for translations not in `DISPLAY`. */
const FALLBACK_BADGES = [
  "bg-slate-600",
  "bg-cyan-700",
  "bg-fuchsia-700",
  "bg-lime-700",
  "bg-sky-700",
]

/**
 * Display metadata for a translation abbreviation. Always returns a badge color
 * and `featured` flag; `verses`/`description` are present only for known
 * translations.
 */
export function bibleDisplayMeta(abbreviation: string): BibleDisplayMeta {
  const key = abbreviation.trim().toUpperCase()
  const entry = DISPLAY[key]
  if (entry) {
    return {
      verses: entry.verses,
      description: entry.description,
      badgeClass: entry.badgeClass,
      featured: entry.featured ?? false,
    }
  }
  return { badgeClass: fallbackBadge(key), featured: false }
}

/** Stable color for an unknown abbreviation, derived from its characters. */
function fallbackBadge(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return FALLBACK_BADGES[hash % FALLBACK_BADGES.length]
}

/** Prettify a language code for display; pass through non-code labels. */
export function languageLabel(language: string): string {
  const names: Record<string, string> = {
    en: "English",
    fr: "French",
    es: "Spanish",
    pt: "Portuguese",
  }
  return names[language] ?? language
}

/** Format a byte count as a compact "X.Y MB" / "N KB" size string. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—"
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = bytes / 1024
  return `${Math.round(kb)} KB`
}
