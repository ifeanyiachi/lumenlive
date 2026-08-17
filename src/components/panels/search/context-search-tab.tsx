import { bibleActions } from "@/hooks/use-bible"
import { useDragSource } from "@/stores/drag-store"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { HighlightedText } from "./highlighted-text"
import { LexiconToggle } from "./lexicon-toggle"
import { QueueButton } from "./queue-button"
import { LexiconBar } from "@/components/panels/LexiconBar"
import type { SemanticSearchResult, Translation, Verse } from "@/types"

type LexiconId = number | string | null

/**
 * The context (semantic / meaning-based) search results list. A flat,
 * similarity-ranked list — no chapter structure, selection highlight, edit
 * button, or multiselect (those are book-search only). Each result is synthesized
 * into a {@link Verse} (real row id is 0) for drag, selection, and the lexicon
 * strip; the lexicon key is location-based since every id is 0.
 */
export function ContextSearchTab({
  contextQuery,
  semanticResults,
  translations,
  activeTranslationId,
  lexiconEnabled,
  lexiconOpenId,
  setLexiconOpenId,
  queuedVerseKeys,
}: {
  contextQuery: string
  semanticResults: SemanticSearchResult[]
  translations: Translation[]
  activeTranslationId: number
  lexiconEnabled: boolean
  lexiconOpenId: LexiconId
  setLexiconOpenId: (updater: (prev: LexiconId) => LexiconId) => void
  queuedVerseKeys: Set<string>
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
              className="group relative flex cursor-pointer flex-col gap-1 rounded-lg p-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex shrink-0 flex-row items-start gap-2">
                <span className="text-xs font-semibold">
                  {result.book_name} {result.chapter}:{result.verse}
                </span>
                <span className="mt-0.5 text-[0.5rem] text-muted-foreground">
                  {Math.round(result.similarity * 100)}%
                </span>
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
                    className="mr-5 ml-auto"
                  />
                )}
              </div>
              <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                <HighlightedText
                  text={result.verse_text}
                  query={contextQuery}
                />
              </p>
              <QueueButton
                verse={verse}
                confidence={result.similarity}
                queued={queuedVerseKeys.has(
                  verseLocationKey(
                    result.book_number,
                    result.chapter,
                    result.verse
                  )
                )}
                positionClassName="absolute top-1/2 right-2 -translate-y-1/2"
                addClassName="bg-primary text-primary-foreground hover:bg-primary/80"
              />
              {/* Lexicon strip */}
              {lexiconEnabled && lexiconOpenId === lexKey && (
                <div className="pl-9" onClick={(e) => e.stopPropagation()}>
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
