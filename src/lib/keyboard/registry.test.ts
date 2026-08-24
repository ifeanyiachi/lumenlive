import { describe, it, expect } from "vitest"
import { matchesChord } from "./match"
import {
  SHORTCUTS,
  GLOBAL_SHORTCUTS,
  CATEGORY_ORDER,
  type ShortcutChord,
} from "./registry"

describe("shortcut registry", () => {
  it("has a unique id for every shortcut", () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every shortcut a label, description, and at least one chord", () => {
    for (const s of SHORTCUTS) {
      expect(s.label, s.id).toBeTruthy()
      expect(s.description, s.id).toBeTruthy()
      expect(s.chords.length, s.id).toBeGreaterThan(0)
    }
  })

  it("uses only categories listed in CATEGORY_ORDER", () => {
    for (const s of SHORTCUTS) {
      expect(CATEGORY_ORDER, s.id).toContain(s.category)
    }
  })

  it("has no two global shortcuts that match the same key event", () => {
    // Two distinct global chords must never fire the same event, or the
    // dispatcher would run two actions for one keypress.
    const globalChords: { id: string; chord: ShortcutChord }[] =
      GLOBAL_SHORTCUTS.flatMap((s) => s.chords.map((chord) => ({ id: s.id, chord })))

    for (let i = 0; i < globalChords.length; i++) {
      for (let j = i + 1; j < globalChords.length; j++) {
        const a = globalChords[i]
        const b = globalChords[j]
        const event = {
          key: a.chord.key,
          ctrlKey: Boolean(a.chord.mod),
          metaKey: false,
          altKey: false,
        }
        const collision =
          matchesChord(event, a.chord) && matchesChord(event, b.chord)
        expect(
          collision,
          `global chords collide: ${a.id} vs ${b.id}`
        ).toBe(false)
      }
    }
  })
})
