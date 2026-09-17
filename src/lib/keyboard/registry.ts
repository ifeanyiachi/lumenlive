/**
 * The single source of truth for the app's keyboard shortcuts.
 *
 * Every shortcut the app documents lives here — both the *global* ones this
 * module's own dispatcher owns (`use-global-shortcuts.ts`) and the *contextual*
 * ones implemented inside the component that owns their surface (the live
 * output panel, the slide editor, book search). The `?` cheat-sheet overlay and
 * the button tooltips are rendered from this list, so a shortcut is never shown
 * in one place and missing from another.
 *
 * This file is pure data (no React/Zustand/Tauri) so it can be imported by the
 * overlay, the dispatcher, and the tests alike.
 *
 * `scope` distinguishes the two kinds:
 *  - `"global"`  — matched and executed by `use-global-shortcuts.ts`. Its
 *    `chords` are load-bearing: the dispatcher matches real key events against
 *    them, so every global chord must be unique (enforced by the registry test).
 *  - `"contextual"` — handled by a component keydown listener elsewhere. Its
 *    `chords` are for *display only*; changing them here does not rebind
 *    anything, so keep them in sync with the owning component by hand.
 */

/** A single key combination. Modifiers default to "must not be held". */
export interface ShortcutChord {
  /**
   * Matched case-insensitively against `KeyboardEvent.key` (e.g. `"t"`, `"/"`,
   * `","`, `"Escape"`, `"ArrowLeft"`). Printable symbols already encode Shift in
   * `key` (`"?"` is Shift+`/`), so Shift is never matched explicitly.
   */
  key: string
  /** Requires Ctrl (Windows/Linux) or ⌘ (macOS). Default: must not be held. */
  mod?: boolean
}

export type ShortcutCategory =
  "General" | "Transcription" | "Search" | "Schedule" | "Live" | "Editing"

/** A documented shortcut — one action, one or more chords that trigger it. */
export interface ShortcutDef {
  /** Stable unique id; the dispatcher switches on this for global shortcuts. */
  id: string
  /** Chords that trigger it. Multiple = alternatives (any one fires it). */
  chords: ShortcutChord[]
  category: ShortcutCategory
  /**
   * `"global"` shortcuts are executed by `use-global-shortcuts.ts`;
   * `"contextual"` ones are listed for documentation but handled by their own
   * component (chords are display-only).
   */
  scope: "global" | "contextual"
}

export const SHORTCUTS: ShortcutDef[] = [
  // ── General (global) ──────────────────────────────────────────────────────
  {
    id: "toggle-shortcuts",
    chords: [{ key: "?" }],
    category: "General",
    scope: "global",
  },
  {
    id: "open-settings",
    chords: [{ key: ",", mod: true }],
    category: "General",
    scope: "global",
  },
  {
    id: "escape",
    chords: [{ key: "Escape" }],
    category: "General",
    scope: "global",
  },

  // ── Transcription (global) ────────────────────────────────────────────────
  {
    id: "transcription-toggle",
    chords: [{ key: "t" }],
    category: "Transcription",
    scope: "global",
  },

  // ── Search (global + contextual) ──────────────────────────────────────────
  {
    id: "focus-search",
    chords: [{ key: "/" }],
    category: "Search",
    scope: "global",
  },
  {
    id: "book-search-navigate",
    chords: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
    category: "Search",
    scope: "contextual",
  },
  {
    id: "book-search-chapter",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    category: "Search",
    scope: "contextual",
  },

  // ── Schedule (global + contextual) ────────────────────────────────────────
  {
    id: "schedule-next",
    chords: [{ key: "n" }],
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-prev",
    chords: [{ key: "p" }],
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-go-to-current",
    chords: [{ key: "f" }],
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-step-items",
    chords: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
    category: "Schedule",
    scope: "contextual",
  },
  {
    id: "schedule-step-deck",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    category: "Schedule",
    scope: "contextual",
  },

  // ── Live output (contextual) ──────────────────────────────────────────────
  {
    id: "live-go",
    chords: [{ key: "Enter" }, { key: " " }],
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-verse-page",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-blackout",
    chords: [{ key: "b", mod: true }],
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-clear",
    chords: [{ key: "c", mod: true }],
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-logo",
    chords: [{ key: "l", mod: true }],
    category: "Live",
    scope: "contextual",
  },

  // ── Editing (contextual) ──────────────────────────────────────────────────
  {
    id: "editor-delete",
    chords: [{ key: "Delete" }, { key: "Backspace" }],
    category: "Editing",
    scope: "contextual",
  },
  {
    id: "editor-undo",
    chords: [{ key: "z", mod: true }],
    category: "Editing",
    scope: "contextual",
  },
  {
    id: "editor-redo",
    chords: [{ key: "y", mod: true }],
    category: "Editing",
    scope: "contextual",
  },
]

/** Display order for the overlay's category sections. */
export const CATEGORY_ORDER: ShortcutCategory[] = [
  "General",
  "Transcription",
  "Search",
  "Schedule",
  "Live",
  "Editing",
]

/** Global shortcuts only — the set the dispatcher matches against. */
export const GLOBAL_SHORTCUTS = SHORTCUTS.filter((s) => s.scope === "global")
