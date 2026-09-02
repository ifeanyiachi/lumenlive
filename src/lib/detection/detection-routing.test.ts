import { describe, expect, it } from "vitest"

import type { DetectionResult } from "@/types/detection"
import {
  MIN_DIRECT_LIVE_CONFIDENCE,
  panelDetections,
  passesPanelFloor,
  shouldAutoDisplayLive,
  shouldAutoQueue,
} from "./detection-routing"

function det(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
    verse_ref: "John 3:16",
    verse_text: "For God so loved the world...",
    book_name: "John",
    book_number: 43,
    chapter: 3,
    verse: 16,
    confidence: 0.95,
    source: "direct",
    auto_queued: false,
    transcript_snippet: "",
    is_chapter_only: false,
    narrative_mention: false,
    ...overrides,
  }
}

describe("passesPanelFloor", () => {
  it("always shows direct references, regardless of the floor", () => {
    const d = det({ source: "direct", confidence: 0.5 })
    expect(passesPanelFloor(d, 0.9)).toBe(true)
    expect(passesPanelFloor(d, 0.99)).toBe(true)
  })

  it("shows semantic hits only at or above the floor", () => {
    expect(passesPanelFloor(det({ source: "semantic", confidence: 0.8 }), 0.8)).toBe(true)
    expect(passesPanelFloor(det({ source: "semantic", confidence: 0.79 }), 0.8)).toBe(false)
  })
})

describe("panelDetections", () => {
  it("keeps all direct hits but drops sub-floor semantic noise", () => {
    const batch = [
      det({ verse_ref: "John 3:16", source: "direct", confidence: 0.4 }),
      det({ verse_ref: "Psalms 22:17", source: "semantic", confidence: 0.76 }),
      det({ verse_ref: "Job 14:1", source: "semantic", confidence: 0.82 }),
    ]
    const kept = panelDetections(batch, 0.8).map((d) => d.verse_ref)
    expect(kept).toEqual(["John 3:16", "Job 14:1"])
  })
})

describe("shouldAutoQueue", () => {
  it("auto-queues direct hits the backend marked", () => {
    expect(shouldAutoQueue(det({ source: "direct", auto_queued: true }))).toBe(true)
    expect(shouldAutoQueue(det({ source: "direct", auto_queued: false }))).toBe(false)
  })

  it("never auto-queues semantic hits, even high-confidence ones", () => {
    expect(
      shouldAutoQueue(det({ source: "semantic", auto_queued: true, confidence: 0.99 }))
    ).toBe(false)
  })
})

describe("shouldAutoDisplayLive", () => {
  it("displays a high-confidence direct reference", () => {
    expect(shouldAutoDisplayLive(det({ confidence: 0.95 }))).toBe(true)
  })

  it("never displays a semantic hit, no matter how confident", () => {
    expect(shouldAutoDisplayLive(det({ source: "semantic", confidence: 1 }))).toBe(false)
  })

  it("blocks direct hits below the live-confidence guard", () => {
    expect(shouldAutoDisplayLive(det({ confidence: MIN_DIRECT_LIVE_CONFIDENCE - 0.01 }))).toBe(
      false
    )
    expect(shouldAutoDisplayLive(det({ confidence: MIN_DIRECT_LIVE_CONFIDENCE }))).toBe(true)
  })

  it("excludes chapter-only stubs and narrative mentions", () => {
    expect(shouldAutoDisplayLive(det({ is_chapter_only: true }))).toBe(false)
    expect(shouldAutoDisplayLive(det({ narrative_mention: true }))).toBe(false)
  })

  it("excludes unresolved references (book_number 0)", () => {
    expect(shouldAutoDisplayLive(det({ book_number: 0 }))).toBe(false)
  })

  it("honours a caller-supplied confidence floor", () => {
    expect(shouldAutoDisplayLive(det({ confidence: 0.85 }), 0.8)).toBe(true)
  })
})
