import { describe, it, expect, vi } from "vitest"
import { createUndoDebouncer } from "./undo-debounce"

describe("createUndoDebouncer", () => {
  it("pushes on the very first call (initial timestamp is 0)", () => {
    const gate = createUndoDebouncer(300)
    const push = vi.fn()
    expect(gate.maybePush(1000, push)).toBe(true)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it("collapses a burst within the window into a single push", () => {
    const gate = createUndoDebouncer(300)
    const push = vi.fn()
    gate.maybePush(1000, push) // pushes, anchors at 1000
    gate.maybePush(1100, push) // +100ms — coalesced
    gate.maybePush(1250, push) // +250ms — coalesced
    gate.maybePush(1299, push) // +299ms — coalesced (strictly-greater boundary)
    expect(push).toHaveBeenCalledTimes(1)
  })

  it("pushes again once more than debounceMs has elapsed", () => {
    const gate = createUndoDebouncer(300)
    const push = vi.fn()
    gate.maybePush(1000, push) // push #1
    gate.maybePush(1200, push) // coalesced
    gate.maybePush(1501, push) // 501ms after the last push (1000) — push #2
    expect(push).toHaveBeenCalledTimes(2)
  })

  it("re-anchors to the last authorized push, not the last call", () => {
    const gate = createUndoDebouncer(300)
    const push = vi.fn()
    gate.maybePush(1000, push) // push #1, anchor 1000
    gate.maybePush(1200, push) // coalesced (anchor stays 1000)
    gate.maybePush(1250, push) // coalesced — still within 300 of 1000
    // 1350 is >300 past the anchor (1000), so it pushes and re-anchors to 1350.
    expect(gate.maybePush(1350, push)).toBe(true)
    expect(gate.maybePush(1600, push)).toBe(false) // 250ms past 1350 — coalesced
    expect(push).toHaveBeenCalledTimes(2)
  })

  it("gives independent gates per instance (theme vs stage)", () => {
    const theme = createUndoDebouncer(300)
    const stage = createUndoDebouncer(300)
    const push = vi.fn()
    theme.maybePush(1000, push)
    // The stage gate has its own timestamp, so it still pushes at the same time.
    expect(stage.maybePush(1000, push)).toBe(true)
    expect(push).toHaveBeenCalledTimes(2)
  })

  it("uses a strictly-greater-than comparison (exactly debounceMs coalesces)", () => {
    const gate = createUndoDebouncer(300)
    const push = vi.fn()
    gate.maybePush(1000, push) // push #1
    expect(gate.maybePush(1300, push)).toBe(false) // exactly 300 later — coalesced
    expect(gate.maybePush(1301, push)).toBe(true) // 301 later — push #2
    expect(push).toHaveBeenCalledTimes(2)
  })
})
