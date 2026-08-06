import { describe, expect, it } from "vitest"
import { pushSnapshot, undo, redo, UNDO_LIMIT } from "./history"

describe("presentation history", () => {
  it("pushSnapshot appends a deep clone", () => {
    const stack = [{ v: 1 }]
    const snap = { v: 2, nested: { a: 1 } }
    const next = pushSnapshot(stack, snap)
    expect(next).toHaveLength(2)
    expect(next[1]).toEqual(snap)
    expect(next[1]).not.toBe(snap)
    expect((next[1] as typeof snap).nested).not.toBe(snap.nested) // deep clone
  })

  it("pushSnapshot caps the stack at UNDO_LIMIT", () => {
    let stack: number[] = []
    for (let i = 0; i < UNDO_LIMIT + 10; i++) stack = pushSnapshot(stack, i)
    expect(stack).toHaveLength(UNDO_LIMIT)
    expect(stack[stack.length - 1]).toBe(UNDO_LIMIT + 9)
  })

  it("structuredClone preserves the snapshot faithfully, including undefined fields", () => {
    const snap = { a: 1, b: undefined }
    const next = pushSnapshot([], snap)
    // structuredClone keeps `b: undefined` (unlike the old JSON round-trip which
    // dropped it); this is inert for reads and JSON persistence.
    expect(next[0]).toEqual(snap)
    expect("b" in (next[0] as object)).toBe(true)
  })

  it("undo pops the last undo snapshot onto redo", () => {
    const step = undo({ v: 3 }, [{ v: 1 }, { v: 2 }], [])
    expect(step).not.toBeNull()
    expect(step!.current).toEqual({ v: 2 })
    expect(step!.undoStack).toEqual([{ v: 1 }])
    expect(step!.redoStack).toEqual([{ v: 3 }])
  })

  it("undo/redo return null on empty stacks", () => {
    expect(undo({ v: 1 }, [], [])).toBeNull()
    expect(redo({ v: 1 }, [], [])).toBeNull()
  })

  it("undo then redo round-trips", () => {
    const edited = { v: "edited" }
    const start = { v: "start" }
    const a = undo(edited, [start], [])!
    expect(a.current).toEqual(start)
    const b = redo(a.current, a.undoStack, a.redoStack)!
    expect(b.current).toEqual(edited)
  })
})
