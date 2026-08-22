import type { SlideBackground, SlideElement, SlideTransition } from "./slide"

// ─────────────────────────────────────────────────────────────────────────────
// The type-first theme model (themeredo.md — the clean-slate rebuild).
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
  "scripture" | "song" | "countdown" | "sermon" | "overlay" | "announcement"

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
