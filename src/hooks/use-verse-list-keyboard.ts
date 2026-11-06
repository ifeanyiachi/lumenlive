import { useCallback } from "react"
import { bibleActions } from "@/hooks/use-bible"
import { verseReference } from "@/lib/search/verse-keys"
import type { Verse } from "@/types"

/** Minimal surface of the quick-nav input the keyboard handler writes to. */
type QuickNavRef = React.RefObject<{ setValue: (text: string) => void } | null>

export interface UseVerseListKeyboardArgs {
  chapter: number
  currentChapter: Verse[]
  effectiveSelectedVerseId: number | null
  setChapter: (updater: (c: number) => number) => void
  setSelectedVerseId: (id: number | null) => void
  quickNavRef: QuickNavRef
}

/**
 * Arrow-key navigation for the book-search verse list: ←/→ step chapters (and
 * clear the selection), ↑/↓ move the selected verse, scrolling it into view and
 * mirroring its reference into the quick-nav input. Book-search only — the panel
 * wires this to `onKeyDown` solely in that mode.
 */
export function useVerseListKeyboard({
  chapter,
  currentChapter,
  effectiveSelectedVerseId,
  setChapter,
  setSelectedVerseId,
  quickNavRef,
}: UseVerseListKeyboardArgs) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (chapter > 1) {
          setChapter((c) => c - 1)
          setSelectedVerseId(null)
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setChapter((c) => c + 1)
        setSelectedVerseId(null)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (currentChapter.length === 0) return
        const currentIdx = effectiveSelectedVerseId
          ? currentChapter.findIndex((v) => v.id === effectiveSelectedVerseId)
          : -1
        const nextIdx = Math.min(currentIdx + 1, currentChapter.length - 1)
        const next = currentChapter[nextIdx]
        if (next) {
          setSelectedVerseId(next.id)
          bibleActions.selectVerse(next)
          quickNavRef.current?.setValue(verseReference(next))
          document
            .getElementById(`verse-${next.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (currentChapter.length === 0) return
        const currentIdx = effectiveSelectedVerseId
          ? currentChapter.findIndex((v) => v.id === effectiveSelectedVerseId)
          : currentChapter.length
        const prevIdx = Math.max(currentIdx - 1, 0)
        const prev = currentChapter[prevIdx]
        if (prev) {
          setSelectedVerseId(prev.id)
          bibleActions.selectVerse(prev)
          quickNavRef.current?.setValue(verseReference(prev))
          document
            .getElementById(`verse-${prev.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      }
    },
    [
      chapter,
      currentChapter,
      effectiveSelectedVerseId,
      setChapter,
      setSelectedVerseId,
      quickNavRef,
    ]
  )
}
