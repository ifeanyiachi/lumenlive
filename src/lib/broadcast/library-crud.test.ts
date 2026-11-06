import { describe, it, expect } from "vitest"
import {
  upsertById,
  removeCustomById,
  duplicateItem,
  renameCustom,
  togglePinById,
  isNameTaken,
  type LibraryItem,
} from "./library-crud"

const item = (over: Partial<LibraryItem> = {}): LibraryItem => ({
  id: "a",
  name: "A",
  builtin: false,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe("upsertById", () => {
  it("appends when the id is new", () => {
    const before = [item({ id: "a" })]
    const next = upsertById(before, item({ id: "b", name: "B" }))
    expect(next.map((i) => i.id)).toEqual(["a", "b"])
    expect(before).toHaveLength(1) // input untouched
  })

  it("replaces in place when the id exists (order preserved)", () => {
    const before = [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })]
    const next = upsertById(before, item({ id: "b", name: "B2" }))
    expect(next.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(next[1].name).toBe("B2")
  })
})

describe("removeCustomById", () => {
  it("removes a custom item", () => {
    const before = [item({ id: "a" }), item({ id: "b" })]
    expect(removeCustomById(before, "a").map((i) => i.id)).toEqual(["b"])
  })

  it("never removes a built-in (no-op)", () => {
    const before = [item({ id: "a", builtin: true }), item({ id: "b" })]
    expect(removeCustomById(before, "a").map((i) => i.id)).toEqual(["a", "b"])
  })
})

describe("duplicateItem", () => {
  it("clones as a fresh unpinned custom with '… Copy' name and stamped times", () => {
    const source = item({
      id: "a",
      name: "Sunday",
      builtin: true,
      pinned: true,
      createdAt: 1,
      updatedAt: 2,
    })
    const copy = duplicateItem(source, "new-id", 999)
    expect(copy).toMatchObject({
      id: "new-id",
      name: "Sunday Copy",
      builtin: false,
      pinned: false,
      createdAt: 999,
      updatedAt: 999,
    })
  })

  it("carries over non-metadata fields from the source", () => {
    const source = { ...item({ id: "a" }), foo: 42 } as LibraryItem & {
      foo: number
    }
    const copy = duplicateItem(source, "new", 1)
    expect(copy.foo).toBe(42)
  })
})

describe("renameCustom", () => {
  it("renames a custom item and bumps updatedAt", () => {
    const before = [item({ id: "a", name: "Old", updatedAt: 0 })]
    const next = renameCustom(before, "a", "New", 500)
    expect(next[0]).toMatchObject({ name: "New", updatedAt: 500 })
  })

  it("never renames a built-in", () => {
    const before = [item({ id: "a", name: "Old", builtin: true })]
    const next = renameCustom(before, "a", "New", 500)
    expect(next[0].name).toBe("Old")
    expect(next[0].updatedAt).toBe(0)
  })
})

describe("isNameTaken", () => {
  const items = [
    item({ id: "a", name: "Sunday" }),
    item({ id: "b", name: "Midweek" }),
  ]

  it("matches case-insensitively and ignoring surrounding whitespace", () => {
    expect(isNameTaken(items, "sunday")).toBe(true)
    expect(isNameTaken(items, "  SUNDAY  ")).toBe(true)
  })

  it("returns false for an unused name", () => {
    expect(isNameTaken(items, "Evening")).toBe(false)
  })

  it("excludes the item being saved/renamed via excludeId", () => {
    expect(isNameTaken(items, "Sunday", "a")).toBe(false)
    expect(isNameTaken(items, "Sunday", "b")).toBe(true)
  })
})

describe("togglePinById", () => {
  it("flips pinned and bumps updatedAt (built-ins can be pinned)", () => {
    const before = [item({ id: "a", builtin: true, pinned: false })]
    const pinned = togglePinById(before, "a", 500)
    expect(pinned[0]).toMatchObject({ pinned: true, updatedAt: 500 })
    const unpinned = togglePinById(pinned, "a", 600)
    expect(unpinned[0]).toMatchObject({ pinned: false, updatedAt: 600 })
  })

  it("leaves other items untouched", () => {
    const before = [item({ id: "a" }), item({ id: "b", pinned: false })]
    const next = togglePinById(before, "a", 1)
    expect(next[1]).toBe(before[1]) // referentially unchanged
  })
})
