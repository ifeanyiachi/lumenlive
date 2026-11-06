import { describe, it, expect } from "vitest"
import { buildStageUpdatePayload } from "./stage-payload"
import type { StageLayout } from "@/types/stage-layout"

describe("buildStageUpdatePayload", () => {
  it("wraps a layout + live context into the stage-update shape", () => {
    const layout = { id: "L", zones: [] } as unknown as StageLayout
    const payload = buildStageUpdatePayload(layout, {
      currentVerse: null,
      currentSlide: null,
      notes: "hi",
      timer: null,
      message: "msg",
      announcement: null,
      playlist: ["a", "b"],
    })
    expect(payload).toEqual({
      layout,
      currentVerse: null,
      currentSlide: null,
      notes: "hi",
      timer: null,
      message: "msg",
      announcement: null,
      playlist: ["a", "b"],
    })
  })
})
