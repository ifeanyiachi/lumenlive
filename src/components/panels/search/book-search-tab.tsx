import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ArrowLeftIcon, ArrowRightIcon, PencilIcon } from "lucide-react"
import { useDragSource } from "@/stores/drag-store"
import { verseEditKey } from "@/types/verse-edit"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { LexiconToggle } from "./lexicon-toggle"
import { QueueButton } from "./queue-button"
import { MultiSelectBar } from "./multi-select-bar"
import { LexiconBar } from "@/components/panels/LexiconBar"
import type { Book, Translation, Verse } from "@/types"
import type { VerseEdit } from "@/types/verse-edit"

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
  queuedVerseKeys: Set<string>
  verseEdits: Record<string, VerseEdit>
  onEditVerse: (verse: Verse) => void
  // Multi-select
  multiSelected: Set<number>
  handleVerseClick: (verse: Verse, e: React.MouseEvent) => void
  onMultiAddToSchedule: () => void
  onMultiEdit: () => void
  onMultiQueueGroup: () => void
  onMultiPresent: () => void
  onMultiClear: () => void
}

/**
 * The book (reference) search list: a chapter header with prev/next navigation
 * and the verses of the current chapter. Book-only affordances live here — the
 * per-verse Edit button, the selected / multi-selected highlight, multi-verse
 * drag, and the floating {@link MultiSelectBar}. Shared per-row controls (lexicon
 * toggle, add-to-queue) come from the same leaves the context list uses.
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
  queuedVerseKeys,
  verseEdits,
  onEditVerse,
  multiSelected,
  handleVerseClick,
  onMultiAddToSchedule,
  onMultiEdit,
  onMultiQueueGroup,
  onMultiPresent,
  onMultiClear,
}: BookSearchTabProps) {
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
                  {/* Edit verse (book-only) */}
                  {(() => {
                    const hasEdit =
                      verseEditKey(
                        activeTranslationId,
                        verse.book_number,
                        verse.chapter,
                        verse.verse
                      ) in verseEdits
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={
                                hasEdit
                                  ? "Edit saved formatting"
                                  : "Edit verse formatting"
                              }
                              className={cn(
                                "relative shrink-0 transition-opacity",
                                hasEdit
                                  ? "text-amber-400"
                                  : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                onEditVerse(verse)
                              }}
                            >
                              <PencilIcon className="size-3" />
                              {hasEdit && (
                                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-amber-400" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {hasEdit
                              ? "Edit saved formatting"
                              : "Edit verse formatting"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })()}
                  <QueueButton
                    verse={verse}
                    confidence={1}
                    queued={queuedVerseKeys.has(
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
                  <div className="pl-9" onClick={(e) => e.stopPropagation()}>
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
          onQueueGroup={onMultiQueueGroup}
          onPresent={onMultiPresent}
          onClear={onMultiClear}
        />
      )}
    </>
  )
}
