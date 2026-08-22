import { beforeEach, describe, expect, it } from "vitest"
import { useDetectionStore } from "./detection-store"
import type { DetectionResult } from "@/types"

function det(
  ref: string,
  source: DetectionResult["source"],
  confidence: number
): DetectionResult {
  return {
    verse_ref: ref,
    verse_text: `text ${ref}`,
    book_name: "John",
    book_number: 43,
    chapter: 3,
    verse: 16,
    confidence,
    source,
    auto_queued: false,
    transcript_snippet: ref,
    is_chapter_only: false,
  }
}

describe("detection store", () => {
  beforeEach(() => {
    useDetectionStore.setState({ detections: [] })
  })

  it("keeps the direct hit when a slower semantic pass reports the same verse", () => {
    const add = useDetectionStore.getState().addDetections
    // Fast direct worker emits first.
    add([det("John 3:16", "direct", 0.95)])
    // Slower semantic worker emits the same verse ~300-600ms later.
    add([det("John 3:16", "semantic", 0.72)])

    const { detections } = useDetectionStore.getState()
    expect(detections).toHaveLength(1)
    expect(detections[0].source).toBe("direct")
    expect(detections[0].confidence).toBe(0.95)
  })

  it("lets a direct hit upgrade an earlier semantic detection", () => {
    const add = useDetectionStore.getState().addDetections
    add([det("John 3:16", "semantic", 0.72)])
    add([det("John 3:16", "direct", 0.95)])

    const { detections } = useDetectionStore.getState()
    expect(detections).toHaveLength(1)
    expect(detections[0].source).toBe("direct")
  })

  it("refreshes a semantic hit with a newer semantic re-detection", () => {
    const add = useDetectionStore.getState().addDetections
    add([det("John 3:16", "semantic", 0.6)])
    add([det("John 3:16", "semantic", 0.8)])

    const { detections } = useDetectionStore.getState()
    expect(detections).toHaveLength(1)
    expect(detections[0].confidence).toBe(0.8)
  })

  it("re-ranks a re-detected verse to the top", () => {
    const add = useDetectionStore.getState().addDetections
    add([det("John 3:16", "direct", 0.95)])
    add([det("Rom 5:8", "direct", 0.9)])
    // Re-mentioning John 3:16 semantically moves it back to the top while
    // preserving its direct source.
    add([det("John 3:16", "semantic", 0.7)])

    const { detections } = useDetectionStore.getState()
    expect(detections.map((d) => d.verse_ref)).toEqual([
      "John 3:16",
      "Rom 5:8",
    ])
    expect(detections[0].source).toBe("direct")
  })

  it("addDetection also protects a direct hit from semantic downgrade", () => {
    const store = useDetectionStore.getState()
    store.addDetection(det("John 3:16", "direct", 0.95))
    store.addDetection(det("John 3:16", "semantic", 0.72))

    const { detections } = useDetectionStore.getState()
    expect(detections).toHaveLength(1)
    expect(detections[0].source).toBe("direct")
  })

  it("dedupes within a batch keeping the highest confidence", () => {
    useDetectionStore
      .getState()
      .addDetections([
        det("John 3:16", "semantic", 0.6),
        det("John 3:16", "semantic", 0.9),
      ])

    const { detections } = useDetectionStore.getState()
    expect(detections).toHaveLength(1)
    expect(detections[0].confidence).toBe(0.9)
  })
})
