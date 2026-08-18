import { describe, expect, it } from "vitest"
import type { ServiceSchedule } from "@/types/schedule"
import {
  SCHEDULE_FILE_FORMAT,
  SCHEDULE_FILE_VERSION,
  ScheduleParseError,
  parseScheduleFile,
  scheduleFileName,
  serializeSchedule,
} from "./schedule-io"

function sampleSchedule(): ServiceSchedule {
  return {
    id: "sched-1",
    name: "Sunday Morning",
    createdAt: 1000,
    updatedAt: 2000,
    items: [
      {
        id: "i1",
        type: "header",
        label: "Welcome",
        order: 0,
      },
      {
        id: "i2",
        type: "scripture",
        label: "John 3:16 (KJV)",
        order: 1,
        translationId: 1,
        bookNumber: 43,
        chapter: 3,
        verseStart: 16,
        verseEnd: 16,
        cachedReference: "John 3:16 (KJV)",
        cachedText: "For God so loved the world...",
      },
    ],
  }
}

// Deterministic id/clock injectors so the pure functions stay testable.
function seqIds() {
  let n = 0
  return () => `new-${n++}`
}

describe("serializeSchedule + parseScheduleFile", () => {
  it("round-trips a schedule's content, with fresh ids and re-based orders", () => {
    const original = sampleSchedule()
    const text = serializeSchedule(original, 12345)
    const parsed = parseScheduleFile(text, seqIds(), 9999)

    // Fresh identity — never reuses the exported ids.
    expect(parsed.id).toBe("new-0")
    expect(parsed.id).not.toBe(original.id)
    expect(parsed.createdAt).toBe(9999)
    expect(parsed.updatedAt).toBe(9999)

    // Content preserved.
    expect(parsed.name).toBe("Sunday Morning")
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[1]).toMatchObject({
      type: "scripture",
      cachedText: "For God so loved the world...",
      order: 1,
    })

    // Every item id is fresh and orders are contiguous from 0.
    expect(parsed.items.map((i) => i.id)).toEqual(["new-1", "new-2"])
    expect(parsed.items.map((i) => i.order)).toEqual([0, 1])
    expect(parsed.items[0].id).not.toBe(original.items[0].id)
  })

  it("writes a self-describing envelope", () => {
    const env = JSON.parse(serializeSchedule(sampleSchedule(), 42))
    expect(env.format).toBe(SCHEDULE_FILE_FORMAT)
    expect(env.version).toBe(SCHEDULE_FILE_VERSION)
    expect(env.exportedAt).toBe(42)
  })

  it("drops unknown/invalid items but keeps valid ones, re-basing order", () => {
    const text = JSON.stringify({
      format: SCHEDULE_FILE_FORMAT,
      version: 1,
      exportedAt: 0,
      schedule: {
        id: "x",
        name: "Mixed",
        createdAt: 0,
        updatedAt: 0,
        items: [
          { id: "a", type: "header", label: "H", order: 0 },
          { id: "b", type: "bogus", label: "?", order: 1 },
          "not-an-object",
          {
            id: "c",
            type: "web",
            label: "Clip",
            order: 2,
            url: "x",
            autoplay: false,
            isYouTube: false,
          },
        ],
      },
    })
    const parsed = parseScheduleFile(text, seqIds(), 0)
    expect(parsed.items.map((i) => i.type)).toEqual(["header", "web"])
    expect(parsed.items.map((i) => i.order)).toEqual([0, 1])
  })

  it("defaults a missing/blank name", () => {
    const text = JSON.stringify({
      format: SCHEDULE_FILE_FORMAT,
      version: 1,
      exportedAt: 0,
      schedule: { name: "   ", items: [] },
    })
    expect(parseScheduleFile(text, seqIds(), 0).name).toBe("Imported Schedule")
  })

  it("rejects non-JSON", () => {
    expect(() => parseScheduleFile("{not json", seqIds(), 0)).toThrow(
      ScheduleParseError
    )
  })

  it("rejects JSON that isn't a schedule file", () => {
    expect(() =>
      parseScheduleFile(JSON.stringify({ hello: "world" }), seqIds(), 0)
    ).toThrow(/isn't a LumenLive schedule file/)
  })

  it("rejects a newer file version", () => {
    const text = JSON.stringify({
      format: SCHEDULE_FILE_FORMAT,
      version: SCHEDULE_FILE_VERSION + 1,
      exportedAt: 0,
      schedule: { name: "Future", items: [] },
    })
    expect(() => parseScheduleFile(text, seqIds(), 0)).toThrow(/newer version/)
  })

  it("rejects a file missing its schedule payload", () => {
    const text = JSON.stringify({
      format: SCHEDULE_FILE_FORMAT,
      version: 1,
      exportedAt: 0,
    })
    expect(() => parseScheduleFile(text, seqIds(), 0)).toThrow(
      /missing its contents/
    )
  })
})

describe("scheduleFileName", () => {
  it("sanitizes spaces and punctuation, appends the extension", () => {
    expect(scheduleFileName("Sunday Morning!")).toBe("Sunday-Morning.lumsched")
    expect(scheduleFileName("  Evening / Youth  ")).toBe(
      "Evening-Youth.lumsched"
    )
  })

  it("falls back to a default base when the name is empty", () => {
    expect(scheduleFileName("   ")).toBe("schedule.lumsched")
  })
})
