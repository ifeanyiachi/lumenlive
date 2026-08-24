/**
 * Pure matching and display helpers for keyboard shortcuts. No DOM, no React —
 * `matchesChord` takes only the fields it needs so it can be unit-tested with a
 * plain object, and the formatting helpers take an explicit `isMac` flag rather
 * than reading `navigator`, keeping the whole module deterministic.
 */
import type { ShortcutChord } from "./registry"

/** The subset of `KeyboardEvent` a chord match depends on. */
export interface KeyEventLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

/**
 * True when `event` satisfies `chord`.
 *
 * - `key` is compared case-insensitively (so `"t"` matches both `t` and, on a
 *   layout where Shift is held, `T`).
 * - `mod` maps to Ctrl **or** ⌘, so one registry entry covers both platforms.
 *   When `mod` is falsy the combo must NOT carry Ctrl/⌘ — this is what stops a
 *   bare `t` shortcut from firing on Ctrl+T.
 * - Alt is never part of a shortcut here, so an Alt-modified combo never matches.
 */
export function matchesChord(event: KeyEventLike, chord: ShortcutChord): boolean {
  if (event.altKey) return false
  if (event.key.toLowerCase() !== chord.key.toLowerCase()) return false
  const mod = event.ctrlKey || event.metaKey
  return mod === Boolean(chord.mod)
}

/** True when the event matches any of the def's chords. */
export function matchesAny(
  event: KeyEventLike,
  chords: ShortcutChord[]
): boolean {
  return chords.some((c) => matchesChord(event, c))
}

/** Human-readable labels for keys that shouldn't render as their raw value. */
const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  enter: "Enter",
  delete: "Del",
  backspace: "⌫",
}

/**
 * Render one chord as an ordered list of key caps for the overlay, e.g.
 * `{ key: ",", mod: true }` → `["Ctrl", ","]` (or `["⌘", ","]` on macOS).
 * Single letters are upper-cased for legibility (`t` → `T`).
 */
export function formatChord(chord: ShortcutChord, isMac: boolean): string[] {
  const caps: string[] = []
  if (chord.mod) caps.push(isMac ? "⌘" : "Ctrl")
  const lower = chord.key.toLowerCase()
  const label =
    KEY_LABELS[lower] ??
    (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key)
  caps.push(label)
  return caps
}
