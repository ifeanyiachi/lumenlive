import { useEffect } from "react"

import { liveVerseAnchor } from "@/lib/voice/live-verse-anchor"
import { setDetectionContext } from "@/services/detection-gateway"
import { useBibleStore } from "@/stores/bible-store"
import { useBroadcastStore } from "@/stores/broadcast-store"

/**
 * Keep the backend's semantic-detection context in lockstep with the scripture
 * the operator currently has live.
 *
 * The operator keys the passage verse-by-verse as they follow the sermon; that
 * committed live selection is a far stronger anchor than anything the detector
 * can infer from speech alone. Pushing its book+chapter lets semantic detection
 * bias toward the chapter being preached, so the next verse read surfaces
 * instead of an out-of-chapter near-match. Clears (nulls) when nothing is live.
 *
 * Mount once at the app root. A plain store subscription is used (not a
 * selector) and de-duplicated here so the backend is hit only when the live
 * book/chapter actually changes, never on every unrelated broadcast tick.
 */
export function useDetectionContextSync() {
  useEffect(() => {
    let lastBook: number | null = null
    let lastChapter: number | null = null

    const push = () => {
      const { liveVerse } = useBroadcastStore.getState()
      const bible = useBibleStore.getState()
      const anchor = liveVerseAnchor(
        liveVerse,
        bible.books,
        bible.activeTranslationId
      )
      const book = anchor?.book_number ?? null
      const chapter = anchor?.chapter ?? null
      if (book === lastBook && chapter === lastChapter) return
      lastBook = book
      lastChapter = chapter
      void setDetectionContext(book, chapter)
    }

    // Prime once, then update whenever broadcast state changes (the dedup guard
    // collapses this to one push per live book/chapter change).
    push()
    return useBroadcastStore.subscribe(push)
  }, [])
}
