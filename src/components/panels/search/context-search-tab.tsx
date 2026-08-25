import { bibleActions } from "@/hooks/use-bible"
import { useDragSource } from "@/stores/drag-store"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { HighlightedText } from "./highlighted-text"
import { LexiconToggle } from "./lexicon-toggle"
import { ScheduleButton } from "./schedule-button"
import { LexiconBar } from "@/components/panels/LexiconBar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PencilIcon } from "lucide-react"
import type { SemanticSearchResult, Translation, Verse } from "@/types"

type LexiconId = number | string | null

/**
 * The context (semantic / meaning-based) search results list. A flat,
 * similarity-ranked list — no chapter structure, selection highlight, or
 * multiselect (those are book-search only). Each result is synthesized into a
 * {@link Verse} (real row id is 0) for drag, selection, and the lexicon strip;
 * the lexicon key is location-based since every id is 0.
 */
export function ContextSearchTab({
  contextQuery,
  semanticResults,
  translations,
  activeTranslationId,
  lexiconEnabled,
  lexiconOpenId,
  setLexiconOpenId,
  scheduledVerseKeys,
  translation,
  onEditVerse,
  onVerseDoubleClick,
}: {
  contextQuery: string
  semanticResults: SemanticSearchResult[]
  translations: Translation[]
  activeTranslationId: number
  lexiconEnabled: boolean
  lexiconOpenId: LexiconId
  setLexiconOpenId: (updater: (prev: LexiconId) => LexiconId) => void
  scheduledVerseKeys: Set<string>
  /** Active translation abbreviation, cached on each schedule item's label. */
  translation: string
  /** Open the verse-formatting editor for a result. */
  onEditVerse: (verse: Verse) => void
  /** Double-click / double-tap a result to stage it and send it straight live. */
  onVerseDoubleClick: (verse: Verse) => void
}) {
  const verseDrag = useDragSource()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-0 p-2">
        {contextQuery.length < 5 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Search by meaning — type a phrase, paraphrase, or topic...
          </p>
        )}
        {contextQuery.length >= 5 && semanticResults.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No results found
          </p>
        )}
        {semanticResults.map((result, idx) => {
          // Context results are synthesized (no real row id), so we build the
          // Verse once here and reuse it for drag, selection, and the lexicon
          // strip. The lexicon key is location-based since every id is 0.
          const verse: Verse = {
            id: 0,
            translation_id: activeTranslationId,
            book_number: result.book_number,
            book_name: result.book_name,
            book_abbreviation: "",
            chapter: result.chapter,
            verse: result.verse,
            text: result.verse_text,
          }
          const lexKey = `${result.book_number}:${result.chapter}:${result.verse}`
          return (
            <div
              key={`${result.book_number}-${result.chapter}-${result.verse}-${idx}`}
              {...verseDrag(() => ({
                payload: {
                  kind: "verses" as const,
                  verses: [verse],
                  translation:
                    translations.find((t) => t.id === activeTranslationId)
                      ?.abbreviation ?? "KJV",
                  translationId: activeTranslationId,
                },
                label: verseReference(verse),
              }))}
              onClick={() => {
                bibleActions.selectVerse(verse)
              }}
              onDoubleClick={() => onVerseDoubleClick(verse)}
              className="group flex cursor-pointer flex-col gap-1 rounded-lg p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex shrink-0 flex-row items-center gap-2">
                <span className="text-xs font-semibold">
                  {result.book_name} {result.chapter}:{result.verse}
                </span>
                <span className="text-[0.5rem] text-muted-foreground">
                  {Math.round(result.similarity * 100)}%
                </span>
                {/* Right-aligned per-row controls — lexicon toggle, Edit, add to
                    schedule — mirroring the book-search row's inline alignment,
                    gap-3 spacing, and hover reveal. */}
                <div className="ml-auto flex items-center gap-3">
                  {/* Lexicon toggle (He / Gr) — only when the lexicon is enabled */}
                  {lexiconEnabled && (
                    <LexiconToggle
                      bookNumber={verse.book_number}
                      open={lexiconOpenId === lexKey}
                      onToggle={() =>
                        setLexiconOpenId((prev) =>
                          prev === lexKey ? null : lexKey
                        )
                      }
                    />
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Edit verse formatting"
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
                        Edit verse formatting
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <ScheduleButton
                    verse={verse}
                    translation={translation}
                    scheduled={scheduledVerseKeys.has(
                      verseLocationKey(
                        result.book_number,
                        result.chapter,
                        result.verse
                      )
                    )}
                    addClassName="bg-primary/40! text-primary-foreground hover:bg-primary!"
                  />
                </div>
              </div>
              <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                <HighlightedText
                  text={result.verse_text}
                  query={contextQuery}
                />
              </p>
              {/* Lexicon strip */}
              {lexiconEnabled && lexiconOpenId === lexKey && (
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
  )
}
