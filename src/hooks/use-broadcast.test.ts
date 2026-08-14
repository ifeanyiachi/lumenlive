import { describe, expect, it } from "vitest"
import type { Verse, QueueItem, DetectionResult } from "@/types"
import { useBibleStore, useBroadcastStore, useQueueStore } from "@/stores"
import {
  deriveLiveVerse,
  presentQueueVerse,
  presentDetectionLive,
} from "./use-broadcast"

const sampleVerse: Verse = {
  id: 1,
  translation_id: 1,
  book_number: 1,
  book_name: "Genesis",
  book_abbreviation: "Gen",
  chapter: 1,
  verse: 2,
  text: "The earth was without form and void.",
}

describe("deriveLiveVerse", () => {
  it("returns null when live output is off", () => {
    const result = deriveLiveVerse({
      isLive: false,
      selectedVerse: sampleVerse,
      translation: "KJV",
    })

    expect(result).toBeNull()
  })

  it("returns verse render data when live output is on", () => {
    const result = deriveLiveVerse({
      isLive: true,
      selectedVerse: sampleVerse,
      translation: "KJV",
    })

    expect(result).toEqual(
      expect.objectContaining({
        reference: "Genesis 1:2 (KJV)",
      })
    )
  })
})

describe("presentQueueVerse", () => {
  const queueItem: QueueItem = {
    id: "q1",
    verse: sampleVerse,
    reference: "Genesis 1:2",
    confidence: 0.9,
    source: "ai-direct",
    added_at: 0,
  }

  it("stages the queue verse into the Program preview without going live", () => {
    useBibleStore.setState({
      translations: [
        {
          id: 1,
          abbreviation: "KJV",
          title: "King James Version",
          language: "en",
          is_copyrighted: false,
          is_downloaded: true,
        },
      ],
      activeTranslationId: 1,
    })
    // A verse that just auto-detected: it is "active" in the queue but nothing
    // is staged, so Enter would otherwise be a no-op.
    useQueueStore.setState({ items: [queueItem], activeIndex: null })
    useBroadcastStore.setState({ previewVerse: null, previewPending: false })

    presentQueueVerse(queueItem, 0)

    const queue = useQueueStore.getState()
    const bs = useBroadcastStore.getState()
    // The row becomes active and the verse is staged to preview (pending),
    // pinned to the queue source — but it has NOT been committed to air.
    expect(queue.activeIndex).toBe(0)
    expect(bs.previewPending).toBe(true)
    expect(bs.previewSource).toBe("queue")
    expect(bs.previewVerse).toEqual(
      expect.objectContaining({ reference: "Genesis 1:2 (KJV)" })
    )
  })
})

describe("presentDetectionLive", () => {
  const detection: DetectionResult = {
    verse_ref: "Genesis 1:2",
    verse_text: "The earth was without form and void.",
    book_name: "Genesis",
    book_number: 1,
    chapter: 1,
    verse: 2,
    confidence: 0.9,
    source: "direct",
    auto_queued: false,
    transcript_snippet: "",
    is_chapter_only: false,
  }

  it("sends the detection straight to the audience (stage + take in one step)", () => {
    useBibleStore.setState({
      translations: [
        {
          id: 1,
          abbreviation: "KJV",
          title: "King James Version",
          language: "en",
          is_copyrighted: false,
          is_downloaded: true,
        },
      ],
      activeTranslationId: 1,
      selectedVerse: null,
    })
    useBroadcastStore.setState({
      liveVerse: null,
      previewVerse: null,
      previewPending: false,
      broadcastSource: null,
    })

    presentDetectionLive(detection)

    const bible = useBibleStore.getState()
    const bs = useBroadcastStore.getState()
    // The verse is selected, and — unlike queue/schedule present — it is
    // committed live immediately: previewPending is cleared and liveVerse is set.
    expect(bible.selectedVerse).toEqual(
      expect.objectContaining({ book_number: 1, chapter: 1, verse: 2 })
    )
    expect(bs.previewPending).toBe(false)
    expect(bs.liveVerse).toEqual(
      expect.objectContaining({ reference: "Genesis 1:2 (KJV)" })
    )
  })
})
