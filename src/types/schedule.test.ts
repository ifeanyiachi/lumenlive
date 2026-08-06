import { describe, expect, it } from "vitest"
import { scheduleItemKey, type SongScheduleItem } from "./schedule"

function songItem(overrides: Partial<SongScheduleItem> = {}): SongScheduleItem {
  return {
    id: "item-1",
    type: "song",
    label: "Amazing Grace",
    order: 0,
    songId: "song-1",
    cachedTitle: "Amazing Grace",
    ...overrides,
  }
}

describe("scheduleItemKey (song)", () => {
  it("keys by song id and arrangement, defaulting the arrangement", () => {
    expect(scheduleItemKey(songItem())).toBe("song:song-1:default")
    expect(scheduleItemKey(songItem({ arrangementId: "arr-2" }))).toBe(
      "song:song-1:arr-2"
    )
  })

  it("treats the same song + arrangement as duplicates", () => {
    expect(scheduleItemKey(songItem({ id: "a" }))).toBe(
      scheduleItemKey(songItem({ id: "b" }))
    )
  })

  it("returns null for an unconfigured placeholder", () => {
    expect(scheduleItemKey(songItem({ songId: "" }))).toBeNull()
  })
})
