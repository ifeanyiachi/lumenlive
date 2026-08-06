import type { Verse } from "@/types/bible"
import type { VerseRenderData, VerseSegment } from "@/types/broadcast"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { verseEditKey } from "@/types/verse-edit"

export function buildMultiVerseReference(
  verses: Verse[],
  translation: string
): string {
  if (verses.length === 0) return ""
  if (verses.length === 1) {
    const v = verses[0]
    return `${v.book_name} ${v.chapter}:${v.verse} (${translation})`
  }

  const sorted = [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })

  const groups: {
    bookName: string
    bookNumber: number
    chapters: Map<number, number[]>
  }[] = []

  for (const v of sorted) {
    let group = groups.find((g) => g.bookNumber === v.book_number)
    if (!group) {
      group = {
        bookName: v.book_name,
        bookNumber: v.book_number,
        chapters: new Map(),
      }
      groups.push(group)
    }
    const chapterVerses = group.chapters.get(v.chapter) ?? []
    chapterVerses.push(v.verse)
    group.chapters.set(v.chapter, chapterVerses)
  }

  const parts: string[] = []

  for (const group of groups) {
    const chapterParts: string[] = []
    for (const [ch, verseNums] of group.chapters) {
      chapterParts.push(`${ch}:${compactRanges(verseNums)}`)
    }
    parts.push(`${group.bookName} ${chapterParts.join("; ")}`)
  }

  return `${parts.join("; ")} (${translation})`
}

function compactRanges(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let end = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i]
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`)
      start = sorted[i]
      end = sorted[i]
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`)
  return ranges.join(", ")
}

export function toMultiVerseRenderData(
  verses: Verse[],
  translation: string
): VerseRenderData {
  const sorted = [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })

  const segments: VerseSegment[] = []

  for (const v of sorted) {
    const editKey = verseEditKey(
      v.translation_id,
      v.book_number,
      v.chapter,
      v.verse
    )
    const savedEdit = useVerseEditStore.getState().getEdit(editKey)

    if (savedEdit && savedEdit.segments.length > 0) {
      segments.push(...savedEdit.segments)
    } else {
      segments.push({
        verseNumber: v.verse,
        text: v.text,
      })
    }
  }

  return {
    reference: buildMultiVerseReference(sorted, translation),
    segments,
  }
}
