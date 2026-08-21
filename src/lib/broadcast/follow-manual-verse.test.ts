import { describe, expect, it } from "vitest"
import { shouldStageManualVerse } from "./follow-manual-verse"

const base = {
  isLive: true,
  wasLive: true,
  hasSelection: true,
  previewPending: false,
  previewSource: null as "schedule" | "queue" | "manual" | null,
}

describe("shouldStageManualVerse", () => {
  it("follows the manual selection while live once past the go-live transition", () => {
    expect(shouldStageManualVerse(base)).toBe(true)
  })

  it("never stages while off-air", () => {
    expect(shouldStageManualVerse({ ...base, isLive: false })).toBe(false)
  })

  it("does not auto-stage on the off→on Live transition (go-live starts clean)", () => {
    // This is the reported bug: flipping Live on used to shove the always-present
    // default selection into Program. wasLive=false marks that transition.
    expect(shouldStageManualVerse({ ...base, wasLive: false })).toBe(false)
  })

  it("does nothing when nothing is selected", () => {
    expect(shouldStageManualVerse({ ...base, hasSelection: false })).toBe(false)
  })

  it("does not clobber a pending item staged from the schedule", () => {
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: true,
        previewSource: "schedule",
      })
    ).toBe(false)
  })

  it("does not clobber a pending item staged from the queue", () => {
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: true,
        previewSource: "queue",
      })
    ).toBe(false)
  })

  it("still follows when the pending preview is itself a manual verse", () => {
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: true,
        previewSource: "manual",
      })
    ).toBe(true)
  })

  it("follows when a prior item was taken live but nothing is pending", () => {
    // After takeToLive, previewPending is false; browsing to a new verse should
    // stage it as the next-up even though something is on air.
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: false,
        previewSource: "schedule",
      })
    ).toBe(true)
  })

  it("does not clobber a live multi-verse block presented from the schedule", () => {
    // A grouped block taken live (pending=false) must stay pinned — the single
    // selection can't represent it, so following would shrink Program to 1 verse.
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: false,
        previewSource: "schedule",
        previewSegments: 3,
      })
    ).toBe(false)
  })

  it("does not clobber a live multi-verse block presented from the queue", () => {
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: false,
        previewSource: "queue",
        previewSegments: 4,
      })
    ).toBe(false)
  })

  it("still follows a single presented verse once taken live", () => {
    // Single-verse present: the selection does represent it, so the follow is
    // harmless and browsing away should keep working.
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: false,
        previewSource: "queue",
        previewSegments: 1,
      })
    ).toBe(true)
  })

  it("follows again once a group pin is released (manual selection nulls source)", () => {
    // followManualSelection resets previewSource to null; browsing then stages.
    expect(
      shouldStageManualVerse({
        ...base,
        previewPending: false,
        previewSource: null,
        previewSegments: 3,
      })
    ).toBe(true)
  })
})
