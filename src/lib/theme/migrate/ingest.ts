import type { BroadcastTheme } from "@/types/broadcast"
import type { SlideTheme } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { isValidTheme } from "@/lib/theme/model"
import { broadcastToTheme } from "./broadcast-to-theme"
import { slideThemeToTheme } from "./slide-theme-to-theme"

/**
 * One-time legacy ingest for the type-first theme model (themeredo.md, Phase 5b).
 *
 * The two legacy authoring surfaces persisted custom themes separately —
 * `broadcast-themes.json`'s `customThemes` ({@link BroadcastTheme}, verse/
 * countdown skins) and `presentations.json`'s `customSlideThemes`
 * ({@link SlideTheme}, song/slide looks). This folds both, via the per-model
 * migrators, into the single `themes.json` collection the new store owns.
 *
 * PURE: `newId`/`now` injected; no I/O. The store's hydrate runs this once behind
 * a persisted marker (so a user's later deletions are never re-imported), then
 * persists the result — this function just computes the merged set. A migrated
 * theme that somehow fails its type's placeholder invariant is dropped rather
 * than poisoning the library.
 */

/** The raw legacy custom themes read from the old plugin-store files. */
export interface LegacyThemeSources {
  /** `broadcast-themes.json` → `customThemes`. */
  broadcast?: readonly BroadcastTheme[]
  /** `presentations.json` → `customSlideThemes`. */
  slide?: readonly SlideTheme[]
}

export interface IngestResult {
  /** `existing` followed by the freshly-migrated legacy customs. */
  themes: Theme[]
  /** How many legacy themes migrated and survived validation. */
  added: number
}

/**
 * Migrate every legacy custom theme and append the valid ones to `existing`
 * (themes already in the new store). Migrated themes receive fresh ids, so they
 * never collide with `existing` and the append needs no dedup.
 */
export function ingestLegacyThemes(
  sources: LegacyThemeSources,
  existing: readonly Theme[],
  newId: () => string,
  now = 0
): IngestResult {
  const migrated: Theme[] = []

  // A single malformed legacy record (hand-edited / truncated JSON) must not take
  // the whole ingest down — migrate defensively and skip anything that throws or
  // fails its type's placeholder invariant.
  const tryMigrate = (build: () => Theme) => {
    try {
      const theme = build()
      if (isValidTheme(theme)) migrated.push(theme)
    } catch {
      // drop this record
    }
  }

  for (const bt of sources.broadcast ?? []) {
    tryMigrate(() => broadcastToTheme(bt, now))
  }
  for (const st of sources.slide ?? []) {
    tryMigrate(() => slideThemeToTheme(st, newId, now))
  }

  return { themes: [...existing, ...migrated], added: migrated.length }
}
