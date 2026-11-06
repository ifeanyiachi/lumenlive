import { memo } from "react"
import { useTranslation } from "react-i18next"
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
import type { SemanticSearchResult, Verse } from "@/types"

type LexiconId = number | string | null

/**
 * A single context-search result row. Extracted and {@link memo}-ized so a
 * result list that isn't changing (the common case while the operator toggles a
 * lexicon or the schedule updates elsewhere) doesn't re-render every row. Every
 * prop is a primitive or a stable callback — the drag factory is created *inside*
 * the row via `useDragSource()` rather than passed in, since a fresh factory prop
 * would defeat `memo` (see the perf rules in CLAUDE.md) — and the open/scheduled
 * booleans are derived by the parent so a toggle only re-renders the rows whose
 * flag actually flips.
 */
const ContextResultRow = memo(function ContextResultRow({
  result,
  activeTranslationId,
  translationAbbr,
  highlightQuery,
  lexiconEnabled,
  lexiconOpen,
  scheduled,
  setLexiconOpenId,
  onEditVerse,
  onVerseDoubleClick,
}: {
  result: SemanticSearchResult
  activeTranslationId: number
  /** Active translation abbreviation — used for the drag payload + schedule row. */
  translationAbbr: string
  highlightQuery: string
  lexiconEnabled: boolean
  lexiconOpen: boolean
  scheduled: boolean
  setLexiconOpenId: (updater: (prev: LexiconId) => LexiconId) => void
  onEditVerse: (verse: Verse) => void
  onVerseDoubleClick: (verse: Verse) => void
}) {
  const { t } = useTranslation("panels")
  const verseDrag = useDragSource()

  // Context results are synthesized (no real row id), so we build the Verse once
  // here and reuse it for drag, selection, and the lexicon strip. The lexicon key
  // is location-based since every id is 0.
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
      {...verseDrag(() => ({
        payload: {
          kind: "verses" as const,
          verses: [verse],
          translation: translationAbbr,
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
              open={lexiconOpen}
              onToggle={() =>
                setLexiconOpenId((prev) => (prev === lexKey ? null : lexKey))
              }
            />
          )}
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
          <ScheduleButton
            verse={verse}
            translation={translationAbbr}
            scheduled={scheduled}
            addClassName="bg-primary/40! text-primary-foreground hover:bg-primary!"
          />
        </div>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
        <HighlightedText text={result.verse_text} query={highlightQuery} />
      </p>
      {/* Lexicon strip */}
      {lexiconEnabled && lexiconOpen && (
        // The row spreads `verseDrag` pointer handlers; the lexicon strip (and
        // its popovers/modal, all React-tree descendants) must not leak
        // pointer/click events up to them — otherwise a drag-to-select in a
        // popover trips the drag threshold and a chip click would arm a
        // verse-drag.
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
})

/**
 * The context (semantic / meaning-based) search results list. A flat,
 * similarity-ranked list — no chapter structure, selection highlight, or
 * multiselect (those are book-search only).
 *
 * `highlightQuery` is the *committed* query (the one that produced these
 * results), not the live keystroke text, so the list only re-renders when
 * results change — not on every keypress. A single {@link TooltipProvider} wraps
 * the whole list rather than one per row.
 */
export function ContextSearchTab({
  highlightQuery,
  semanticResults,
  activeTranslationId,
  lexiconEnabled,
  lexiconOpenId,
  setLexiconOpenId,
  scheduledVerseKeys,
  translation,
  onEditVerse,
  onVerseDoubleClick,
}: {
  /** The committed search query (drives highlighting + empty state). */
  highlightQuery: string
  semanticResults: SemanticSearchResult[]
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
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-0 p-2">
        {highlightQuery.length < 5 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Search by meaning — type a phrase, paraphrase, or topic...
          </p>
        )}
        {highlightQuery.length >= 5 && semanticResults.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No results found
          </p>
        )}
        <TooltipProvider>
          {semanticResults.map((result, idx) => {
            const lexKey = `${result.book_number}:${result.chapter}:${result.verse}`
            return (
              <ContextResultRow
                key={`${result.book_number}-${result.chapter}-${result.verse}-${idx}`}
                result={result}
                activeTranslationId={activeTranslationId}
                translationAbbr={translation}
                highlightQuery={highlightQuery}
                lexiconEnabled={lexiconEnabled}
                lexiconOpen={lexiconOpenId === lexKey}
                scheduled={scheduledVerseKeys.has(
                  verseLocationKey(
                    result.book_number,
                    result.chapter,
                    result.verse
                  )
                )}
                setLexiconOpenId={setLexiconOpenId}
                onEditVerse={onEditVerse}
                onVerseDoubleClick={onVerseDoubleClick}
              />
            )
          })}
        </TooltipProvider>
      </div>
    </div>
  )
}
