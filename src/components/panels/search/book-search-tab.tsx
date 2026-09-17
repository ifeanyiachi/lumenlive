import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ArrowLeftIcon, ArrowRightIcon, PencilIcon } from "lucide-react"
import { useDragSource } from "@/stores/drag-store"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { LexiconToggle } from "./lexicon-toggle"
import { ScheduleButton } from "./schedule-button"
import { MultiSelectBar } from "./multi-select-bar"
import { LexiconBar } from "@/components/panels/LexiconBar"
import type { Book, Translation, Verse } from "@/types"

type LexiconId = number | string | null

export interface BookSearchTabProps {
  selectedBook: Book | null
  chapter: number
  setChapter: (updater: (c: number) => number) => void
  setSelectedVerseId: (id: number | null) => void
  currentChapter: Verse[]
  effectiveSelectedVerseId: number | null
  translations: Translation[]
  activeTranslationId: number
  lexiconEnabled: boolean
  lexiconOpenId: LexiconId
  setLexiconOpenId: (updater: (prev: LexiconId) => LexiconId) => void
  scheduledVerseKeys: Set<string>
  /** Active translation abbreviation, cached on each schedule item's label. */
  translation: string
  onEditVerse: (verse: Verse) => void
  // Multi-select
  multiSelected: Set<number>
  handleVerseClick: (verse: Verse, e: React.MouseEvent) => void
  handleVerseDoubleClick: (verse: Verse) => void
  /** Add the selection as one combined block item. */
  onMultiAddToSchedule: () => void
  onMultiEdit: () => void
  /** Add the selection as a collection item (dropdown deck). */
  onMultiAddAsGroup: () => void
  /** Add each verse as its own independent running-order row. */
  onMultiAddSeparately: () => void
  onMultiPresent: () => void
  onMultiClear: () => void
}

/**
 * The book (reference) search list: a chapter header with prev/next navigation
 * and the verses of the current chapter. Book-only affordances live here — the
 * selected / multi-selected highlight, multi-verse drag, and the floating
 * {@link MultiSelectBar}. Shared per-row controls (lexicon toggle, per-verse Edit
 * button, add-to-schedule) come from the same leaves the context list uses.
 */
export function BookSearchTab({
  selectedBook,
  chapter,
  setChapter,
  setSelectedVerseId,
  currentChapter,
  effectiveSelectedVerseId,
  translations,
  activeTranslationId,
  lexiconEnabled,
  lexiconOpenId,
  setLexiconOpenId,
  scheduledVerseKeys,
  translation,
  onEditVerse,
  multiSelected,
  handleVerseClick,
  handleVerseDoubleClick,
  onMultiAddToSchedule,
  onMultiEdit,
  onMultiAddAsGroup,
  onMultiAddSeparately,
  onMultiPresent,
  onMultiClear,
}: BookSearchTabProps) {
  const { t } = useTranslation("panels")
  const verseDrag = useDragSource()

  return (
    <>
      {/* STICKY: Chapter header */}
      <div className="flex min-h-9 shrink-0 items-center justify-between border-b border-border px-3 py-2">
        {selectedBook ? (
          <h3 className="text-sm font-semibold text-foreground">
            {selectedBook.name} {chapter}
          </h3>
        ) : null}
        {selectedBook ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Previous chapter"
              onClick={() => {
                if (chapter > 1) {
                  setChapter((c) => c - 1)
                  setSelectedVerseId(null)
                }
              }}
              disabled={chapter <= 1}
            >
              <ArrowLeftIcon className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Next chapter"
              onClick={() => {
                setChapter((c) => c + 1)
                setSelectedVerseId(null)
              }}
            >
              <ArrowRightIcon className="size-3" />
            </Button>
          </div>
        ) : null}
      </div>

      {/* SCROLLABLE: Verse list only */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-0 p-2">
          {currentChapter.map((verse) => {
            const isMultiSelected = multiSelected.has(verse.id)
            return (
              <div
                key={verse.id}
                id={`verse-${verse.id}`}
                {...verseDrag(() => {
                  const verses =
                    isMultiSelected && multiSelected.size >= 2
                      ? currentChapter.filter((v) => multiSelected.has(v.id))
                      : [verse]
                  return {
                    payload: {
                      kind: "verses" as const,
                      verses,
                      translation:
                        translations.find((t) => t.id === activeTranslationId)
                          ?.abbreviation ?? "KJV",
                      translationId: activeTranslationId,
                    },
                    label:
                      verses.length > 1
                        ? `${verses.length} verses`
                        : verseReference(verse),
                  }
                })}
                className={cn(
                  "group cursor-pointer rounded-lg p-3 transition-colors",
                  isMultiSelected
                    ? "border border-sky-500/50 bg-sky-500/10"
                    : verse.id === effectiveSelectedVerseId
                      ? "border border-lime-500/50 bg-lime-500/10"
                      : "border border-transparent hover:bg-muted/50"
                )}
              >
                {/* Main verse row */}
                <div
                  className="flex items-center gap-3"
                  onClick={(e) => handleVerseClick(verse, e)}
                  onDoubleClick={() => handleVerseDoubleClick(verse)}
                >
                  <span className="w-6 shrink-0 text-right text-sm font-semibold text-primary">
                    {verse.verse}
                  </span>
                  <p className="flex-1 text-sm leading-relaxed text-foreground/80">
                    {verse.text}
                  </p>
                  {/* Lexicon toggle (He / Gr) — only when the lexicon is enabled */}
                  {lexiconEnabled && (
                    <LexiconToggle
                      bookNumber={verse.book_number}
                      open={lexiconOpenId === verse.id}
                      onToggle={() =>
                        setLexiconOpenId((prev) =>
                          prev === verse.id ? null : verse.id
                        )
                      }
                    />
                  )}
                  {/* Edit verse formatting, then add to schedule */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("search.editVerseFormatting")}
                          className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditVerse(verse)
                          }}
                        >
                          <PencilIcon className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        {t("search.editVerseFormatting")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <ScheduleButton
                    verse={verse}
                    translation={translation}
                    scheduled={scheduledVerseKeys.has(
                      verseLocationKey(
                        verse.book_number,
                        verse.chapter,
                        verse.verse
                      )
                    )}
                    addClassName={
                      verse.id === effectiveSelectedVerseId
                        ? "hover:bg-lime-500/20 hover:text-lime-500"
                        : "bg-primary/40! text-primary-foreground hover:bg-primary!"
                    }
                  />
                </div>
                {/* Lexicon strip */}
                {lexiconEnabled && lexiconOpenId === verse.id && (
                  // The row spreads `verseDrag` pointer handlers; the lexicon
                  // strip (and its popovers/modal, all React-tree descendants)
                  // must not leak pointer/click events up to them — otherwise a
                  // drag-to-select in a popover trips the drag threshold and a
                  // chip click would arm a verse-drag.
                  <div
                    className="pl-9"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <LexiconBar verse={verse} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Multi-select floating action bar */}
      {multiSelected.size >= 2 && (
        <MultiSelectBar
          count={multiSelected.size}
          onAddToSchedule={onMultiAddToSchedule}
          onEdit={onMultiEdit}
          onAddAsGroup={onMultiAddAsGroup}
          onAddSeparately={onMultiAddSeparately}
          onPresent={onMultiPresent}
          onClear={onMultiClear}
        />
      )}
    </>
  )
}
