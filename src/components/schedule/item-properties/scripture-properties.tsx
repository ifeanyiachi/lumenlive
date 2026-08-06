import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { BookOpenIcon } from "lucide-react"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { useBibleStore } from "@/stores/bible-store"
import { useScheduleStore } from "@/stores/schedule-store"
import type { ScriptureScheduleItem } from "@/types/schedule"
import type { Verse } from "@/types/bible"

export function ScriptureProperties({
  item,
  scheduleId,
}: {
  item: ScriptureScheduleItem
  scheduleId: string
}) {
  const translations = useBibleStore((s) => s.translations)
  const books = useBibleStore((s) => s.books)
  const [verses, setVerses] = useState<Verse[]>([])

  useEffect(() => {
    if (item.bookNumber && item.chapter) {
      invoke<Verse[]>("get_chapter", {
        translationId: item.translationId,
        bookNumber: item.bookNumber,
        chapter: item.chapter,
      })
        .then(setVerses)
        .catch(() => {})
    }
  }, [item.bookNumber, item.chapter, item.translationId])

  const update = (updates: Partial<ScriptureScheduleItem>) => {
    useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
  }

  const updateReference = (
    bookNumber: number,
    chapter: number,
    verseStart: number,
    verseEnd: number,
    translationId: number
  ) => {
    const book = books.find((b) => b.book_number === bookNumber)
    const trans = translations.find((t) => t.id === translationId)
    const bookName = book?.name ?? "Unknown"
    const abbr = trans?.abbreviation ?? "KJV"
    const ref =
      verseStart === verseEnd
        ? `${bookName} ${chapter}:${verseStart} (${abbr})`
        : `${bookName} ${chapter}:${verseStart}-${verseEnd} (${abbr})`

    const verse = verses.find((v) => v.verse === verseStart)
    update({
      bookNumber,
      chapter,
      verseStart,
      verseEnd,
      translationId,
      cachedReference: ref,
      cachedText: verse?.text ?? "",
      label: ref,
    })
  }

  const filteredBooks = books.filter(
    (b) => b.translation_id === item.translationId
  )

  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-blue-500/10 p-2">
        <BookOpenIcon className="size-3.5 text-blue-400" />
        <span className="text-xs font-medium text-blue-400">Scripture</span>
      </div>

      <FieldGroup label="Translation">
        <select
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={item.translationId}
          onChange={(e) => {
            const tid = Number(e.target.value)
            updateReference(
              item.bookNumber,
              item.chapter,
              item.verseStart,
              item.verseEnd,
              tid
            )
          }}
        >
          {translations.map((t) => (
            <option key={t.id} value={t.id}>
              {t.abbreviation} — {t.title}
            </option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup label="Book">
        <select
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={item.bookNumber}
          onChange={(e) => {
            const bn = Number(e.target.value)
            updateReference(bn, 1, 1, 1, item.translationId)
          }}
        >
          {filteredBooks.map((b) => (
            <option key={b.book_number} value={b.book_number}>
              {b.name}
            </option>
          ))}
        </select>
      </FieldGroup>

      <div className="grid grid-cols-3 gap-2">
        <FieldGroup label="Chapter">
          <Input
            type="number"
            className="h-7 text-xs"
            value={item.chapter}
            min={1}
            onChange={(e) => {
              const ch = Number(e.target.value)
              updateReference(item.bookNumber, ch, 1, 1, item.translationId)
            }}
          />
        </FieldGroup>
        <FieldGroup label="Start">
          <Input
            type="number"
            className="h-7 text-xs"
            value={item.verseStart}
            min={1}
            onChange={(e) => {
              const vs = Number(e.target.value)
              updateReference(
                item.bookNumber,
                item.chapter,
                vs,
                Math.max(vs, item.verseEnd),
                item.translationId
              )
            }}
          />
        </FieldGroup>
        <FieldGroup label="End">
          <Input
            type="number"
            className="h-7 text-xs"
            value={item.verseEnd}
            min={item.verseStart}
            onChange={(e) => {
              const ve = Number(e.target.value)
              updateReference(
                item.bookNumber,
                item.chapter,
                item.verseStart,
                ve,
                item.translationId
              )
            }}
          />
        </FieldGroup>
      </div>

      {item.cachedReference && (
        <div className="rounded-md bg-muted/50 p-2">
          <p className="text-xs font-medium text-foreground">
            {item.cachedReference}
          </p>
          {item.cachedText && (
            <p className="mt-1 text-xs text-muted-foreground">
              {item.cachedText}
            </p>
          )}
        </div>
      )}
    </>
  )
}
