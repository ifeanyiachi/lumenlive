import { describe, expect, it } from "vitest"
import { buildCcliReport, ccliReportToCsv } from "./ccli-report"
import type { SongUsageEntry } from "@/types/song"

function entry(overrides: Partial<SongUsageEntry>): SongUsageEntry {
  return {
    id: crypto.randomUUID(),
    songId: "s1",
    cachedTitle: "Amazing Grace",
    usedAt: 1000,
    ...overrides,
  }
}

describe("buildCcliReport", () => {
  it("groups by song with counts and first/last dates", () => {
    const rows = buildCcliReport([
      entry({
        songId: "s1",
        cachedTitle: "Amazing Grace",
        cachedCcliNumber: "123",
        usedAt: 3000,
      }),
      entry({
        songId: "s1",
        cachedTitle: "Amazing Grace",
        cachedCcliNumber: "123",
        usedAt: 1000,
      }),
      entry({ songId: "s2", cachedTitle: "Goodness of God", usedAt: 2000 }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      songId: "s1",
      count: 2,
      firstUsed: 1000,
      lastUsed: 3000,
      ccliNumber: "123",
    })
    // Sorted most-used first.
    expect(rows[1].songId).toBe("s2")
  })

  it("survives a deleted song via the cached title", () => {
    const rows = buildCcliReport([
      entry({ songId: "gone", cachedTitle: "Old Hymn" }),
    ])
    expect(rows[0].title).toBe("Old Hymn")
  })
})

describe("ccliReportToCsv", () => {
  it("renders a header + rows and quotes cells with commas", () => {
    const csv = ccliReportToCsv(
      buildCcliReport([
        entry({
          songId: "s1",
          cachedTitle: "Grace, Amazing",
          cachedCcliNumber: "123",
          usedAt: 0,
        }),
      ]),
      () => "2026-07-29"
    )
    const lines = csv.split("\n")
    expect(lines[0]).toBe("CCLI Number,Title,Times Used,First Used,Last Used")
    expect(lines[1]).toBe('123,"Grace, Amazing",1,2026-07-29,2026-07-29')
  })
})
