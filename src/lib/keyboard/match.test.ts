import { describe, it, expect } from "vitest"
import {
  matchesChord,
  matchesAny,
  formatChord,
  type KeyEventLike,
} from "./match"

function ev(over: Partial<KeyEventLike>): KeyEventLike {
  return { key: "", ctrlKey: false, metaKey: false, altKey: false, ...over }
}

describe("matchesChord", () => {
  it("matches a bare letter with no modifiers", () => {
    expect(matchesChord(ev({ key: "t" }), { key: "t" })).toBe(true)
  })

  it("is case-insensitive on the key (Shift+t → 'T')", () => {
    expect(matchesChord(ev({ key: "T" }), { key: "t" })).toBe(true)
  })

  it("does NOT fire a bare shortcut when Ctrl is held", () => {
    expect(matchesChord(ev({ key: "t", ctrlKey: true }), { key: "t" })).toBe(
      false
    )
  })

  it("does NOT fire a bare shortcut when ⌘ is held", () => {
    expect(matchesChord(ev({ key: "t", metaKey: true }), { key: "t" })).toBe(
      false
    )
  })

  it("matches a mod chord via Ctrl", () => {
    expect(
      matchesChord(ev({ key: ",", ctrlKey: true }), { key: ",", mod: true })
    ).toBe(true)
  })

  it("matches a mod chord via ⌘ (cross-platform)", () => {
    expect(
      matchesChord(ev({ key: ",", metaKey: true }), { key: ",", mod: true })
    ).toBe(true)
  })

  it("does NOT match a mod chord without a modifier", () => {
    expect(matchesChord(ev({ key: "," }), { key: ",", mod: true })).toBe(false)
  })

  it("never matches when Alt is held", () => {
    expect(matchesChord(ev({ key: "t", altKey: true }), { key: "t" })).toBe(
      false
    )
    expect(
      matchesChord(ev({ key: ",", ctrlKey: true, altKey: true }), {
        key: ",",
        mod: true,
      })
    ).toBe(false)
  })

  it("distinguishes '/' from '?' by key", () => {
    expect(matchesChord(ev({ key: "?" }), { key: "/" })).toBe(false)
    expect(matchesChord(ev({ key: "?" }), { key: "?" })).toBe(true)
  })
})

describe("matchesAny", () => {
  it("fires when any chord matches", () => {
    const chords = [{ key: "Enter" }, { key: " " }]
    expect(matchesAny(ev({ key: " " }), chords)).toBe(true)
    expect(matchesAny(ev({ key: "Enter" }), chords)).toBe(true)
    expect(matchesAny(ev({ key: "x" }), chords)).toBe(false)
  })
})

describe("formatChord", () => {
  it("upper-cases single letters", () => {
    expect(formatChord({ key: "t" }, false)).toEqual(["T"])
  })

  it("renders the platform modifier label", () => {
    expect(formatChord({ key: ",", mod: true }, false)).toEqual(["Ctrl", ","])
    expect(formatChord({ key: ",", mod: true }, true)).toEqual(["⌘", ","])
  })

  it("maps special keys to symbols/labels", () => {
    expect(formatChord({ key: " " }, false)).toEqual(["Space"])
    expect(formatChord({ key: "ArrowLeft" }, false)).toEqual(["←"])
    expect(formatChord({ key: "Escape" }, false)).toEqual(["Esc"])
    expect(formatChord({ key: "?" }, false)).toEqual(["?"])
  })
})
