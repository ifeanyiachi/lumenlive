import type { BroadcastTheme } from "@/types/broadcast"
import type { SlideTheme, SlideThemeCategory } from "@/types/slide"
import type { UnifiedTheme } from "@/types/theme"

/**
 * Conversions between the two native theme types and the {@link UnifiedTheme}
 * container (theme-unification-plan.md, Phase 1).
 *
 * PURE — no React/Zustand/Tauri. The `*ToUnified` lifters wrap a native theme;
 * the `to*Theme` adapters unwrap it back for the render engines. The round-trip
 * is **byte-identical** for the built-ins (proven in `convert.test.ts`): the
 * payload is stored verbatim and the identity metadata is overlaid on the way
 * out so it can never drift from the payload.
 *
 * Note: the adapters return an object that *shares* the payload's nested
 * structures (background/elements/…) with the source — fine for the read-only
 * render path. A caller that mutates must `structuredClone` first (the Phase 3
 * CRUD path will).
 */

/** Slide themes have no authored resolution; they lay out in percent on 16:9. */
export const DEFAULT_SLIDE_RESOLUTION = { width: 1920, height: 1080 }

/** Lift a broadcast (verse) theme into the unified container. */
export function broadcastThemeToUnified(bt: BroadcastTheme): UnifiedTheme {
  return {
    id: bt.id,
    name: bt.name,
    // A themeless broadcast theme normalizes to "general" (it *is* general). All
    // built-ins set a category, so this never fires for them — the round-trip
    // stays exact.
    category: bt.category ?? "general",
    builtin: bt.builtin,
    pinned: bt.pinned,
    createdAt: bt.createdAt,
    updatedAt: bt.updatedAt,
    resolution: bt.resolution,
    kind: "verse",
    verse: bt,
    schema: 1,
  }
}

/** Lift a slide/song theme into the unified container. */
export function slideThemeToUnified(st: SlideTheme): UnifiedTheme {
  return {
    id: st.id,
    name: st.name,
    category: st.category, // slide's 3 categories are a subset of the 6
    builtin: st.builtin,
    // Slide themes carry no pin/timestamp metadata; seed library defaults. These
    // are dropped again by `toSlideTheme`, so the round-trip stays exact.
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: DEFAULT_SLIDE_RESOLUTION,
    kind: "slide",
    slide: st,
    schema: 1,
  }
}

/**
 * Unwrap a unified theme for the verse/broadcast render engine. Returns `null`
 * for a slide-kind theme (it has no verse payload). Identity metadata is
 * overlaid from the container so the library's fields stay authoritative.
 */
export function toBroadcastTheme(u: UnifiedTheme): BroadcastTheme | null {
  if (u.kind !== "verse" || !u.verse) return null
  return {
    ...u.verse,
    id: u.id,
    name: u.name,
    category: u.category,
    builtin: u.builtin,
    pinned: u.pinned,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    resolution: u.resolution,
  }
}

/**
 * Unwrap a unified theme for the slide render engine. Returns `null` for a
 * verse-kind theme. The unified category is narrowed back to the slide subset —
 * a slide-origin theme's category is always one of the three, so this is safe.
 */
export function toSlideTheme(u: UnifiedTheme): SlideTheme | null {
  if (u.kind !== "slide" || !u.slide) return null
  return {
    ...u.slide,
    id: u.id,
    name: u.name,
    category: u.category as SlideThemeCategory,
    builtin: u.builtin,
  }
}
