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
  | "General"
  | "Transcription"
  | "Search"
  | "Schedule"
  | "Live"
  | "Editing"

/** A documented shortcut — one action, one or more chords that trigger it. */
export interface ShortcutDef {
  /** Stable unique id; the dispatcher switches on this for global shortcuts. */
  id: string
  /** Chords that trigger it. Multiple = alternatives (any one fires it). */
  chords: ShortcutChord[]
  /** Short imperative label, e.g. "Focus search". */
  label: string
  /** One-line explanation shown under the label in the overlay. */
  description: string
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
    label: "Keyboard shortcuts",
    description: "Open or close this cheat sheet",
    category: "General",
    scope: "global",
  },
  {
    id: "open-settings",
    chords: [{ key: ",", mod: true }],
    label: "Open settings",
    description: "Open the settings dialog",
    category: "General",
    scope: "global",
  },
  {
    id: "escape",
    chords: [{ key: "Escape" }],
    label: "Close / unfocus",
    description: "Close a dialog, or unfocus the current input",
    category: "General",
    scope: "global",
  },

  // ── Transcription (global) ────────────────────────────────────────────────
  {
    id: "transcription-toggle",
    chords: [{ key: "t" }],
    label: "Start / stop transcription",
    description: "Toggle the live transcription session",
    category: "Transcription",
    scope: "global",
  },

  // ── Search (global + contextual) ──────────────────────────────────────────
  {
    id: "focus-search",
    chords: [{ key: "/" }],
    label: "Focus search",
    description: "Jump to the scripture search input",
    category: "Search",
    scope: "global",
  },
  {
    id: "book-search-navigate",
    chords: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
    label: "Navigate verses",
    description: "Move the selected verse in book search",
    category: "Search",
    scope: "contextual",
  },
  {
    id: "book-search-chapter",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    label: "Step chapter",
    description: "Previous or next chapter in book search",
    category: "Search",
    scope: "contextual",
  },

  // ── Schedule (global + contextual) ────────────────────────────────────────
  {
    id: "schedule-next",
    chords: [{ key: "n" }],
    label: "Next schedule item",
    description: "Stage the next item into Program preview",
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-prev",
    chords: [{ key: "p" }],
    label: "Previous schedule item",
    description: "Stage the previous item into Program preview",
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-go-to-current",
    chords: [{ key: "f" }],
    label: "Go to current item",
    description: "Reveal and highlight the current item on the schedule",
    category: "Schedule",
    scope: "global",
  },
  {
    id: "schedule-step-items",
    chords: [{ key: "ArrowUp" }, { key: "ArrowDown" }],
    label: "Step schedule items",
    description: "Previous or next item when the schedule is focused",
    category: "Schedule",
    scope: "contextual",
  },
  {
    id: "schedule-step-deck",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    label: "Step within a group",
    description: "Move through the slides or verses of a grouped item",
    category: "Schedule",
    scope: "contextual",
  },

  // ── Live output (contextual) ──────────────────────────────────────────────
  {
    id: "live-go",
    chords: [{ key: "Enter" }, { key: " " }],
    label: "Stage then go live",
    description: "First press stages the verse, second sends it to the audience",
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-verse-page",
    chords: [{ key: "ArrowLeft" }, { key: "ArrowRight" }],
    label: "Verse page",
    description: "Previous or next page of a long paginated verse",
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-blackout",
    chords: [{ key: "b", mod: true }],
    label: "Blackout",
    description: "Cut the audience output to black",
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-clear",
    chords: [{ key: "c", mod: true }],
    label: "Clear text",
    description: "Hide the foreground text, keep the background",
    category: "Live",
    scope: "contextual",
  },
  {
    id: "live-logo",
    chords: [{ key: "l", mod: true }],
    label: "Logo / holding slide",
    description: "Show the holding image",
    category: "Live",
    scope: "contextual",
  },

  // ── Editing (contextual) ──────────────────────────────────────────────────
  {
    id: "editor-delete",
    chords: [{ key: "Delete" }, { key: "Backspace" }],
    label: "Delete element",
    description: "Remove the selected element in the slide editor",
    category: "Editing",
    scope: "contextual",
  },
  {
    id: "editor-undo",
    chords: [{ key: "z", mod: true }],
    label: "Undo",
    description: "Undo the last edit in the slide editor",
    category: "Editing",
    scope: "contextual",
  },
  {
    id: "editor-redo",
    chords: [{ key: "y", mod: true }],
    label: "Redo",
    description: "Redo the last undone edit in the slide editor",
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
