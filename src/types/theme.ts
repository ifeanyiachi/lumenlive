import type { BroadcastTheme, ThemeCategory } from "./broadcast"
import type {
  SlideBackground,
  SlideElement,
  SlideTheme,
  SlideTransition,
} from "./slide"

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

// ─────────────────────────────────────────────────────────────────────────────
// The type-first theme model (themeredo.md — the clean-slate rebuild).
//
// This is the *target* model that eventually replaces `UnifiedTheme` and both
// legacy authoring systems. It is introduced additively in Phase 1: the two
// models coexist, nothing user-facing consumes `Theme` yet, and the old paths
// stay byte-identical. `UnifiedTheme` (below) is deleted in Phase 5.
//
// A `Theme` is exactly a styled single **Slide** with an **intrinsic type**,
// whose type-required elements are **placeholders** that content flows into at
// presentation time (the ProPresenter model — a look with placeholders, not a
// category tag on a fixed-slot skin). The type is chosen once at New and can
// never change; there is no "category" and no "general" theme.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The intrinsic kind of a {@link Theme}. Chosen once at creation, it drives the
 * builder, the type-specific properties panel, and how content flows in at
 * go-live. There is intentionally no "general" type.
 */
export type ThemeType =
  | "scripture"
  | "song"
  | "countdown"
  | "sermon"
  | "overlay"
  | "announcement"

/**
 * A styled single-slide template of a given {@link ThemeType}. Its
 * type-required elements are placeholders (a `SlideScriptureElement`, a text
 * element with a `role`, or — from Phase 2 — a timer element) that live or
 * authored content fills when the theme is presented. Everything else is free
 * decoration the author adds around the placeholder.
 */
export interface Theme {
  id: string
  name: string
  /** Intrinsic, chosen at New; drives builder + controls + presentation. */
  type: ThemeType
  /** True for the code-defined catalog themes (never persisted). */
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  background: SlideBackground
  /** The authored look, including this type's typed placeholders. */
  elements: SlideElement[]
  transition?: SlideTransition
}

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
