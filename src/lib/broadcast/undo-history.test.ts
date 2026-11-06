import { describe, expect, it } from "vitest"
import { pushSnapshot, undo, redo, UNDO_MAX } from "./undo-history"

describe("undo-history", () => {
  it("pushSnapshot appends a clone, leaving the original stack and value intact", () => {
    const stack = [{ v: 1 }]
    const snap = { v: 2 }
    const next = pushSnapshot(stack, snap)
    expect(next).toHaveLength(2)
    expect(next).not.toBe(stack)
    expect(next[1]).toEqual(snap)
    expect(next[1]).not.toBe(snap) // stored as a clone
  })

  it("pushSnapshot drops the oldest entry past the cap", () => {
    let stack: number[] = []
    for (let i = 0; i < UNDO_MAX + 5; i++) stack = pushSnapshot(stack, i)
    expect(stack).toHaveLength(UNDO_MAX)
    expect(stack[0]).toBe(5) // first five shifted out
    expect(stack[stack.length - 1]).toBe(UNDO_MAX + 4)
  })

  it("pushSnapshot honours a custom max", () => {
    let stack: number[] = []
    for (let i = 0; i < 6; i++) stack = pushSnapshot(stack, i, 3)
    expect(stack).toEqual([3, 4, 5])
  })

  it("undo pops the last snapshot and pushes current onto redo", () => {
    const step = undo({ v: 3 }, [{ v: 1 }, { v: 2 }], [])
    expect(step).not.toBeNull()
    expect(step!.current).toEqual({ v: 2 })
    expect(step!.undoStack).toEqual([{ v: 1 }])
    expect(step!.redoStack).toEqual([{ v: 3 }])
  })

  it("undo returns null with an empty undo stack", () => {
    expect(undo({ v: 1 }, [], [{ v: 0 }])).toBeNull()
  })

  it("redo pops the last redo snapshot and pushes current onto undo", () => {
    const step = redo({ v: 2 }, [{ v: 1 }], [{ v: 3 }])
    expect(step).not.toBeNull()
    expect(step!.current).toEqual({ v: 3 })
    expect(step!.undoStack).toEqual([{ v: 1 }, { v: 2 }])
    expect(step!.redoStack).toEqual([])
  })

  it("redo returns null with an empty redo stack", () => {
    expect(redo({ v: 1 }, [{ v: 0 }], [])).toBeNull()
  })

  it("undo then redo round-trips back to the starting value", () => {
    const start = { v: "start" }
    const edited = { v: "edited" }
    const afterUndo = undo(edited, [start], [])!
    expect(afterUndo.current).toEqual(start)
    const afterRedo = redo(
      afterUndo.current,
      afterUndo.undoStack,
      afterUndo.redoStack
    )!
    expect(afterRedo.current).toEqual(edited)
  })
})
