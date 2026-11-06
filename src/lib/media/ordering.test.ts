import { describe, expect, it } from "vitest"
import type { MediaAsset } from "@/types/media"
import { byRecencyDesc, sortByRecency } from "./ordering"

function asset(id: string, addedAt: number): MediaAsset {
  return {
    id,
    name: id,
    type: "image",
    filePath: `/${id}`,
    fileSize: 0,
    tags: [],
    addedAt,
  }
}

describe("media ordering", () => {
  it("orders most-recently-added first", () => {
    const older = asset("older", 100)
    const newer = asset("newer", 200)
    const newest = asset("newest", 300)
    const ordered = sortByRecency([older, newest, newer])
    expect(ordered.map((a) => a.id)).toEqual(["newest", "newer", "older"])
  })

  it("keeps insertion order for assets sharing an addedAt (stable)", () => {
    // A bulk import stamps one timestamp across the batch; the batch should keep
    // the order it was picked in.
    const a = asset("a", 500)
    const b = asset("b", 500)
    const c = asset("c", 500)
    const ordered = sortByRecency([a, b, c])
    expect(ordered.map((x) => x.id)).toEqual(["a", "b", "c"])
  })

  it("puts a whole fresh batch above everything older", () => {
    const old1 = asset("old1", 10)
    const old2 = asset("old2", 10)
    const new1 = asset("new1", 99)
    const new2 = asset("new2", 99)
    // Mirrors the store: existing assets first, fresh batch appended last.
    const ordered = sortByRecency([old1, old2, new1, new2])
    expect(ordered.map((a) => a.id)).toEqual(["new1", "new2", "old1", "old2"])
  })

  it("does not mutate the input array", () => {
    const input = [asset("a", 1), asset("b", 2)]
    const snapshot = input.map((a) => a.id)
    sortByRecency(input)
    expect(input.map((a) => a.id)).toEqual(snapshot)
  })

  it("byRecencyDesc returns a positive number when b is newer", () => {
    expect(byRecencyDesc(asset("a", 1), asset("b", 2))).toBeGreaterThan(0)
  })
})
