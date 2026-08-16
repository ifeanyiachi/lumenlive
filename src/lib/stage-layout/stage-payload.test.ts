import { describe, it, expect } from "vitest"
import { buildStageUpdatePayload } from "./stage-payload"
import type { StageLayout } from "@/types/stage-layout"
import type { BroadcastTheme } from "@/types/broadcast"

describe("buildStageUpdatePayload", () => {
  it("wraps a layout + theme + live context into the stage-update shape", () => {
    const layout = { id: "L", zones: [] } as unknown as StageLayout
    const theme = { id: "T" } as unknown as BroadcastTheme
    const payload = buildStageUpdatePayload(layout, theme, {
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
      currentTheme: theme,
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
