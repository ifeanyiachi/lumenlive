import type { BroadcastTheme, ThemeCategory } from "./broadcast"
import type { SlideTheme } from "./slide"

// The unified theme model (theme-unification-plan.md, Phase 1).
//
// One identity + library surface over BOTH theme systems, so every theme —
// verse/scripture (broadcast) and song/slide — lives in one registry, one
// designer list, and one persisted collection. The *render payload* stays native
// to each engine for now (`verse` = BroadcastTheme, `slide` = SlideTheme) so
// output remains byte-identical; the deeper element-level merge (one element
// union, verse regions → elements) is the Phase 4 structural step.
//
// Why a faithful two-payload container rather than a single element union: the
// two element models are mutually lossy — slide text carries both `bold` and a
// numeric `fontWeight`, broadcast shapes have `fillOpacity` while slide shapes
// have whole-element `opacity`, verse text is a *region* not an element. Storing
// each side verbatim makes the adapters near-identity and the round-trip exact.

export type { ThemeCategory }

/** Which render engine a unified theme drives, and thus which payload is set. */
export type ThemeKind = "verse" | "slide"

export interface UnifiedTheme {
  // ── Identity / library metadata (authoritative source of truth) ──
  id: string
  name: string
  /** The 6-value superset. Slide's 3 (general/song/scripture) are a subset. */
  category: ThemeCategory
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  /** Authoring resolution; verse payloads carry their own, slide uses 1920×1080. */
  resolution: { width: number; height: number }

  // ── Render payload (exactly one is set, per `kind`) ──
  kind: ThemeKind
  /** Present iff `kind === "verse"` — the broadcast verse-skin, verbatim. */
  verse?: BroadcastTheme
  /** Present iff `kind === "slide"` — the slide variants, verbatim. */
  slide?: SlideTheme

  /** Schema version, for future persisted-shape migrations. */
  schema: 1
}
