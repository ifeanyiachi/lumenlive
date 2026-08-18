import {
  memo,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  getAutocompleteSuggestion,
  getTabNavigationResult,
} from "@/lib/quick-search"
import { cn } from "@/lib/utils"
import { useBibleStore } from "@/stores"
import type { Book, Verse, Translation } from "@/types"
import { Input } from "@/components/ui/input"
import { fetchChapter } from "@/services/bible-search-gateway"
import { TranslationSelect } from "@/components/panels/search/translation-select"

/** Imperative surface the parent uses to mirror the selected verse into the input. */
export interface QuickNavHandle {
  setValue: (text: string) => void
  focus: () => void
  inputEl: () => HTMLInputElement | null
}

/**
 * Quick-nav input. Owns its own `quickInput` + autocomplete
 * state so typing here re-renders ONLY this leaf — not the parent SearchPanel and
 * its ~176-row verse list. The parent pushes the selected verse's reference in via
 * the imperative `setValue` handle (a ref write, so it doesn't re-render the list).
 *
 * Wrapped in `memo`: the parent re-renders on tab/verse-selection state, but this
 * leaf's props (`books`/`translations`/`activeTranslationId`) stay stable, so those
 * parent renders don't cascade into (and re-mount focus/caret state of) the input.
 */
export const QuickNavInput = memo(
  forwardRef<
    QuickNavHandle,
    { books: Book[]; translations: Translation[]; activeTranslationId: number }
  >(function QuickNavInput({ books, translations, activeTranslationId }, ref) {
    const [quickInput, setQuickInput] = useState("")
    const [showQuickVerses, setShowQuickVerses] = useState(false)
    const [quickVersesList, setQuickVersesList] = useState<Verse[]>([])
    const quickInputRef = useRef<HTMLInputElement>(null)
    // True when the pending `quickInput` change came from an imperative
    // `setValue()` (a verse selected elsewhere — schedule list, verse list, arrow
    // keys) rather than the user typing. An external update must NOT re-navigate
    // or pull focus into the search box; the field activates only on a real click.
    const externalUpdateRef = useRef(false)

    useImperativeHandle(
      ref,
      () => ({
        setValue: (text: string) => {
          externalUpdateRef.current = true
          setQuickInput(text)
        },
        focus: () => quickInputRef.current?.focus(),
        inputEl: () => quickInputRef.current,
      }),
      []
    )

    // Derive autocomplete suggestion during render (no setState cascading)
    const autocompleteResult = useMemo(
      () => getAutocompleteSuggestion(quickInput, books),
      [quickInput, books]
    )
    const quickSuggestion = autocompleteResult.suggestion

    // Side effects only: navigation + verse loading
    useEffect(() => {
      const result = autocompleteResult

      // A completion pushed in via setValue() (a verse picked elsewhere) is
      // already navigated by the caller — re-navigating and grabbing focus here is
      // what made the search field steal keystrokes. Consume the flag and skip
      // those steps; the verse dropdown fetch below still runs for browsing.
      const isExternal = externalUpdateRef.current
      externalUpdateRef.current = false

      // Only navigate on a fully-typed reference (Book Chapter:Verse). The "book"
      // and "chapter" stages carry a default verse of 1, so navigating on them
      // would fire on every keystroke — and the navigation subscription writes the
      // resolved reference back into the input, fighting the user's typing and
      // making deletion impossible (input snaps back to "Book C:1"). Partial input
      // still populates the verse dropdown below, so browsing is unaffected.
      if (
        !isExternal &&
        result.stage === "complete" &&
        result.matchedBook &&
        result.chapter &&
        result.verse
      ) {
        useBibleStore.getState().setPendingNavigation({
          bookNumber: result.matchedBook.book_number,
          chapter: result.chapter,
          verse: result.verse,
        })

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (
              quickInputRef.current &&
              document.activeElement !== quickInputRef.current
            ) {
              quickInputRef.current.focus()
            }
          })
        })
      }

      if (
        (result.stage === "chapter" || result.stage === "verse") &&
        result.matchedBook &&
        result.chapter
      ) {
        fetchChapter(
          activeTranslationId,
          result.matchedBook.book_number,
          result.chapter
        )
          .then((verses) => {
            setQuickVersesList(verses)
            setShowQuickVerses(true)
          })
          .catch(console.error)
      }
    }, [autocompleteResult, activeTranslationId])

    // Derive dropdown visibility: only show when autocomplete stage is chapter/verse
    const shouldShowVerseDropdown =
      showQuickVerses &&
      (autocompleteResult.stage === "chapter" ||
        autocompleteResult.stage === "verse")

    const handleQuickKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Tab or → accepts suggestion and advances to NEXT STAGE
        if (
          (e.key === "Tab" || e.key === "ArrowRight") &&
          quickSuggestion &&
          quickSuggestion !== quickInput
        ) {
          e.preventDefault()
          const nextInput = getTabNavigationResult(quickInput, quickSuggestion)
          setQuickInput(nextInput)
          return
        }

        // Enter is a no-op: the verse is already showing in the panel, and
        // clearing the field on Enter surprised users. Swallow it so it neither
        // clears the input nor triggers any default/parent action.
        if (e.key === "Enter") {
          e.preventDefault()
          return
        }

        // Escape clears
        if (e.key === "Escape") {
          e.preventDefault()
          setQuickInput("")
          setShowQuickVerses(false)
          return
        }
      },
      [quickInput, quickSuggestion]
    )

    const handleQuickVerseClick = useCallback((verse: Verse) => {
      useBibleStore.getState().setPendingNavigation({
        bookNumber: verse.book_number,
        chapter: verse.chapter,
        verse: verse.verse,
      })
      setQuickInput("")
      setShowQuickVerses(false)
    }, [])

    return (
      <div className="flex flex-1 items-center gap-2 pr-3">
        {/* Quick-nav autocomplete */}
        <div className="relative flex-1">
          {/* Suggestion overlay */}
          {quickSuggestion && quickSuggestion !== quickInput && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center px-3">
              <span className="text-xs font-normal">
                <span className="text-foreground">{quickInput}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {quickSuggestion.slice(quickInput.length)}
                </span>
              </span>
            </div>
          )}

          {/* Actual input */}
          <Input
            ref={quickInputRef}
            data-tour="quick-nav"
            value={quickInput}
            onChange={(e) => {
              // Real typing: clear the external flag so navigation-on-complete works.
              externalUpdateRef.current = false
              setQuickInput(e.target.value)
            }}
            onKeyDown={handleQuickKeyDown}
            placeholder="Type: J → John 3:16"
            className={cn(
              "relative h-7 bg-background text-xs",
              quickSuggestion && quickSuggestion !== quickInput
                ? "text-transparent"
                : ""
            )}
            style={
              quickSuggestion && quickSuggestion !== quickInput
                ? {
                    caretColor: "var(--foreground)",
                  }
                : undefined
            }
          />

          {/* Verse dropdown */}
          {shouldShowVerseDropdown && quickVersesList.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              <div className="p-1">
                {quickVersesList.map((verse) => (
                  <button
                    key={verse.id}
                    onClick={() => handleQuickVerseClick(verse)}
                    className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="w-6 shrink-0 text-right font-semibold text-primary">
                      {verse.verse}
                    </span>
                    <span className="line-clamp-1 flex-1 text-muted-foreground">
                      {verse.text}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <TranslationSelect
          translations={translations}
          activeTranslationId={activeTranslationId}
        />
      </div>
    )
  })
)
