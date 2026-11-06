import { describe, expect, it } from "vitest"

import type { DetectionResult } from "@/types/detection"
import {
  MIN_DIRECT_PREVIEW_CONFIDENCE,
  autoPreviewCandidates,
  panelDetections,
  passesPanelFloor,
  shouldAutoStagePreview,
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
    expect(
      passesPanelFloor(det({ source: "semantic", confidence: 0.8 }), 0.8)
    ).toBe(true)
    expect(
      passesPanelFloor(det({ source: "semantic", confidence: 0.79 }), 0.8)
    ).toBe(false)
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
    expect(shouldAutoQueue(det({ source: "direct", auto_queued: true }))).toBe(
      true
    )
    expect(shouldAutoQueue(det({ source: "direct", auto_queued: false }))).toBe(
      false
    )
  })

  it("never auto-queues semantic hits, even high-confidence ones", () => {
    expect(
      shouldAutoQueue(
        det({ source: "semantic", auto_queued: true, confidence: 0.99 })
      )
    ).toBe(false)
  })
})

describe("shouldAutoStagePreview", () => {
  it("stages a high-confidence direct reference", () => {
    expect(shouldAutoStagePreview(det({ confidence: 0.95 }))).toBe(true)
  })

  it("never stages a semantic hit, no matter how confident", () => {
    expect(
      shouldAutoStagePreview(det({ source: "semantic", confidence: 1 }))
    ).toBe(false)
  })

  it("blocks direct hits below the preview-confidence guard", () => {
    expect(
      shouldAutoStagePreview(
        det({ confidence: MIN_DIRECT_PREVIEW_CONFIDENCE - 0.01 })
      )
    ).toBe(false)
    expect(
      shouldAutoStagePreview(det({ confidence: MIN_DIRECT_PREVIEW_CONFIDENCE }))
    ).toBe(true)
  })

  it("excludes chapter-only stubs", () => {
    expect(shouldAutoStagePreview(det({ is_chapter_only: true }))).toBe(false)
  })

  it("excludes unresolved references (book_number 0)", () => {
    expect(shouldAutoStagePreview(det({ book_number: 0 }))).toBe(false)
  })

  it("honours a caller-supplied confidence floor", () => {
    expect(shouldAutoStagePreview(det({ confidence: 0.85 }), 0.8)).toBe(true)
  })
})

describe("autoPreviewCandidates", () => {
  it("returns every eligible direct reference", () => {
    expect(
      autoPreviewCandidates([
        det({ verse_ref: "John 3:16" }),
        det({ verse_ref: "Romans 8:28" }),
      ])
    ).toEqual([
      expect.objectContaining({ verse_ref: "John 3:16" }),
      expect.objectContaining({ verse_ref: "Romans 8:28" }),
    ])
  })

  it("deduplicates repeated references using the highest confidence hit", () => {
    expect(
      autoPreviewCandidates([
        det({ verse_ref: "John 3:16", confidence: 0.91 }),
        det({ verse_ref: "John 3:16", confidence: 0.99 }),
      ])
    ).toEqual([
      expect.objectContaining({ verse_ref: "John 3:16", confidence: 0.99 }),
    ])
  })

  it("keeps direct references regardless of spoken phrasing", () => {
    expect(
      autoPreviewCandidates([
        det({ verse_ref: "Isaiah 9:11" }),
        det({ verse_ref: "Ecclesiastes 9:11" }),
      ])
    ).toEqual([
      expect.objectContaining({ verse_ref: "Isaiah 9:11" }),
      expect.objectContaining({ verse_ref: "Ecclesiastes 9:11" }),
    ])
  })
})
