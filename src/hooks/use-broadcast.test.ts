import { describe, expect, it } from "vitest"
import type { Verse, QueueItem, DetectionResult } from "@/types"
import { useBibleStore, useBroadcastStore, useQueueStore } from "@/stores"
import {
  deriveLiveVerse,
  presentQueueVerse,
  presentDetectionLive,
  previewDetection,
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

describe("previewDetection", () => {
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

  const setupBible = () =>
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
      pendingNavigation: null,
    })

  it("stages the detection into the Program preview without going live", () => {
    setupBible()
    useBroadcastStore.setState({
      liveVerse: null,
      previewVerse: null,
      previewPending: false,
      broadcastSource: null,
    })

    previewDetection(detection)

    const bs = useBroadcastStore.getState()
    // Staged to preview (pending, pinned to queue) but the audience is untouched.
    expect(bs.previewPending).toBe(true)
    expect(bs.previewSource).toBe("queue")
    expect(bs.previewVerse).toEqual(
      expect.objectContaining({ reference: "Genesis 1:2 (KJV)" })
    )
    expect(bs.liveVerse).toBeNull()
  })

  it("navigates the book panel with focusPanel:false without releasing the pin", () => {
    setupBible()
    const priorSelection = { ...sampleVerse, id: 99 }
    useBibleStore.setState({
      selectedVerse: priorSelection,
      pendingNavigation: null,
    })
    useBroadcastStore.setState({
      previewVerse: null,
      previewPending: false,
    })

    previewDetection(detection)

    // Preview navigates the book search to the verse via pendingNavigation with
    // focusPanel:false, which the panel resolves with the raw (non-pin-releasing)
    // selectVerse — so the staged "queue" preview survives loadChapter's async
    // reconcile instead of flickering off. previewDetection itself does not touch
    // selectedVerse; the panel updates it (raw) once the chapter loads.
    const bible = useBibleStore.getState()
    expect(bible.selectedVerse).toBe(priorSelection)
    expect(bible.pendingNavigation).toEqual({
      bookNumber: detection.book_number,
      chapter: detection.chapter,
      verse: detection.verse,
      focusPanel: false,
    })
  })

  it("a released pin can't blank the live output on a later takeToLive", () => {
    setupBible()
    const existingLive = { reference: "Psalm 23:1 (KJV)", segments: [] }
    useBroadcastStore.setState({
      isLive: true,
      liveVerse: existingLive,
      previewVerse: null,
      previewPending: false,
      broadcastSource: null,
    })

    previewDetection(detection)
    // Simulate a pin release (what a manual book-search select does):
    // followManualSelection clears the staged preview. It must also clear
    // previewPending — otherwise takeToLive would fire with a null previewVerse
    // and overwrite the audience with a blank. With the pin released there is
    // nothing to take, so the existing live verse must be left untouched.
    useBroadcastStore.getState().followManualSelection()
    useBroadcastStore.getState().takeToLive()

    const bs = useBroadcastStore.getState()
    expect(bs.previewPending).toBe(false)
    expect(bs.liveVerse).toBe(existingLive)
  })
})
