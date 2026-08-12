import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react"
// Using native overflow-y-auto instead of Radix ScrollArea for reliable scrolling in flex layouts
import { Button } from "@/components/ui/button"
import {
  getAutocompleteSuggestion,
  getTabNavigationResult,
} from "@/lib/quick-search"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  BookOpenIcon,
  SparklesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
  PencilIcon,
  PlayIcon,
  XIcon,
  LayersIcon,
  ListPlusIcon,
  ImageIcon,
  LayoutTemplateIcon,
  MusicIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useBible, bibleActions } from "@/hooks/use-bible"
import {
  useBibleStore,
  useQueueStore,
  useBroadcastStore,
  useSettingsStore,
} from "@/stores"
import { useScheduleStore } from "@/stores/schedule-store"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { useDragSource } from "@/stores/drag-store"
import { verseEditKey } from "@/types/verse-edit"
import type { Book, Verse, Translation } from "@/types"
import { Input } from "@/components/ui/input"
import { LexiconBar } from "@/components/panels/LexiconBar"
import { SearchMediaTab } from "@/components/panels/search-media-tab"
import { SearchSlideTab } from "@/components/panels/search-slide-tab"
import { SearchSongTab } from "@/components/panels/search-song-tab"
import { VerseEditModal } from "@/components/verse-edit/verse-edit-modal"
import {
  toMultiVerseRenderData,
  buildMultiVerseReference,
} from "@/lib/multi-verse"
import { setActiveTranslation } from "@/services/translation-gateway"
import { fetchChapter } from "@/services/bible-search-gateway"
import { useContextSearch } from "@/hooks/use-context-search"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { buildQueryWordSet, isHighlightedWord } from "@/lib/search/highlight"
import { resolveEffectiveVerseId } from "@/lib/search/verse-selection"
import { toast } from "sonner"

type SearchTab = "book" | "context"
type ContentTab = "verse" | "media" | "slide" | "song"

const CONTENT_TABS: {
  value: ContentTab
  label: string
  icon: typeof BookOpenIcon
}[] = [
  { value: "verse", label: "Verse", icon: BookOpenIcon },
  { value: "media", label: "Media", icon: ImageIcon },
  { value: "slide", label: "Slide", icon: LayoutTemplateIcon },
  { value: "song", label: "Song", icon: MusicIcon },
]

/** Highlights words from the query that appear in the text. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>

  const queryWords = buildQueryWordSet(query)
  if (queryWords.size === 0) return <>{text}</>

  // Split text into words while preserving whitespace/punctuation
  const parts = text.split(/(\s+)/)
  return (
    <>
      {parts.map((part, i) => {
        if (isHighlightedWord(part, queryWords)) {
          return (
            <mark
              key={i}
              className="rounded-[2px] bg-emerald-800/90 px-0.5 text-foreground"
            >
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

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
 */
const QuickNavInput = forwardRef<
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

      <Select
        value={String(activeTranslationId)}
        onValueChange={async (v) => {
          const id = Number(v)
          try {
            await setActiveTranslation(id)
            useBibleStore.getState().setActiveTranslation(id)
          } catch (err) {
            console.error(err)
            toast.error("Couldn't switch translation", {
              description: String(err),
            })
          }
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-[72px] shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {translations.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.abbreviation}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
})

export function SearchPanel() {
  const verseDrag = useDragSource()
  const [contentTab, setContentTab] = useState<ContentTab>("verse")
  const [activeTab, setActiveTab] = useState<SearchTab>("book")
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState(1)
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null)

  // Greek/Hebrew interlinear is installed-but-disabled by default; the whole
  // affordance (toggle + strip) stays hidden until enabled in Bible settings.
  const lexiconEnabled = useSettingsStore((s) => s.lexiconEnabled)
  // Book-search rows key by real `verse.id` (number); context-search results
  // are synthesized with `id: 0`, so they key by a "book:chapter:verse" string.
  const [lexiconOpenId, setLexiconOpenId] = useState<number | string | null>(
    null
  )
  const [editingVerse, setEditingVerse] = useState<Verse | null>(null)

  // Multi-verse selection
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set())
  const lastClickedIdRef = useRef<number | null>(null)

  // Clear multi-select when the book/chapter changes. Adjusted during render
  // (rather than in an effect) to avoid cascading renders.
  const bookChapterKey = `${selectedBook?.book_number ?? "none"}:${chapter}`
  const [prevBookChapterKey, setPrevBookChapterKey] = useState(bookChapterKey)
  if (prevBookChapterKey !== bookChapterKey) {
    setPrevBookChapterKey(bookChapterKey)
    setMultiSelected(new Set())
  }
  // Reset the shift-click anchor (ref writes belong in an effect, not render).
  useEffect(() => {
    lastClickedIdRef.current = null
  }, [selectedBook, chapter])

  // The autocomplete lives in the QuickNavInput leaf; the parent
  // only pushes the selected verse's reference into it via this imperative handle.
  const quickNavRef = useRef<QuickNavHandle>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    translations,
    books,
    currentChapter,
    semanticResults,
    activeTranslationId,
    selectedVerse,
  } = useBible()

  const activeTranslationAbbr = useMemo(
    () =>
      translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
      "KJV",
    [translations, activeTranslationId]
  )

  // Context (meaning-based) search — debounce + hybrid/Fuse fallback + staleness
  // all live in the hook; the panel just supplies the query and renders results.
  const { contextQuery, setContextQuery, handleContextSearch } =
    useContextSearch({
      activeTab,
      activeTranslationId,
    })

  const queueItems = useQueueStore((s) => s.items)
  const queuedVerseKeys = useMemo(() => {
    return new Set(
      queueItems.map((item) =>
        verseLocationKey(
          item.verse.book_number,
          item.verse.chapter,
          item.verse.verse
        )
      )
    )
  }, [queueItems])

  const verseEdits = useVerseEditStore((s) => s.edits)

  const selectedBookNumber = selectedBook?.book_number

  // Load initial data and default to Genesis 1:1
  useEffect(() => {
    bibleActions.loadTranslations().catch((err) => {
      console.error(err)
      toast.error("Couldn't load translations", { description: String(err) })
    })
    bibleActions
      .loadBooks()
      .then(() => {
        useBibleStore.getState().setPendingNavigation({
          bookNumber: 1,
          chapter: 1,
          verse: 1,
        })
      })
      .catch((err) => {
        console.error(err)
        toast.error("Couldn't load Bible books", { description: String(err) })
      })
  }, [])

  // Load chapter when book + chapter are set
  useEffect(() => {
    if (selectedBookNumber && chapter >= 1) {
      bibleActions.loadChapter(selectedBookNumber, chapter).catch((err) => {
        console.error(err)
        toast.error("Couldn't load chapter", { description: String(err) })
      })
    }
  }, [selectedBookNumber, chapter, activeTranslationId])

  const effectiveSelectedVerseId = useMemo(
    () =>
      resolveEffectiveVerseId(currentChapter, selectedVerseId, selectedVerse),
    [currentChapter, selectedVerseId, selectedVerse]
  )

  // After chapter reloads (e.g., translation change), re-select by verse number
  useEffect(() => {
    if (!selectedVerseId || !selectedVerse || currentChapter.length === 0)
      return
    const stillExists = currentChapter.some((v) => v.id === selectedVerseId)
    if (!stillExists) {
      const match = currentChapter.find((v) => v.verse === selectedVerse.verse)
      if (match && match.id !== selectedVerse.id) {
        bibleActions.selectVerse(match)
      }
    }
  }, [currentChapter, selectedVerseId, selectedVerse])

  const applyNavigationSelection = useCallback(
    (book: Book, navChapter: number) => {
      setContentTab("verse")
      setActiveTab("book")
      setSelectedBook(book)
      setChapter(navChapter)
    },
    []
  )

  // Auto-navigate when a detection or "Present" click sets pendingNavigation
  useEffect(() => {
    let lastHandledKey: string | null = null

    const unsubscribe = useBibleStore.subscribe((state) => {
      const pendingNavigation = state.pendingNavigation
      if (!pendingNavigation) {
        lastHandledKey = null
        return
      }

      const {
        bookNumber,
        chapter: navChapter,
        verse: navVerse,
      } = pendingNavigation
      const pendingKey = `${bookNumber}:${navChapter}:${navVerse}`
      if (pendingKey === lastHandledKey) return

      const book = state.books.find((b) => b.book_number === bookNumber)
      if (!book) return

      lastHandledKey = pendingKey
      applyNavigationSelection(book, navChapter)

      // Load chapter explicitly, then select + scroll to the verse.
      bibleActions
        .loadChapter(bookNumber, navChapter)
        .then((verses) => {
          const target = verses.find((v) => v.verse === navVerse)
          if (target) {
            setSelectedVerseId(target.id)
            bibleActions.selectVerse(target)
            quickNavRef.current?.setValue(verseReference(target))
            document
              .getElementById(`verse-${target.id}`)
              ?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          // Only grab keyboard focus for navigations the operator drove from the
          // book search or a detection. Schedule-driven navigations pass
          // focusPanel:false so the arrow keys stay with the schedule list.
          if (
            pendingNavigation.focusPanel !== false &&
            document.activeElement !== quickNavRef.current?.inputEl()
          ) {
            panelRef.current?.focus()
          }
        })
        .catch(console.error)
        .finally(() => {
          useBibleStore.getState().setPendingNavigation(null)
        })
    })

    return unsubscribe
  }, [applyNavigationSelection])

  const handleVerseClick = useCallback(
    (verse: Verse, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setMultiSelected((prev) => {
          const next = new Set(prev)
          if (next.has(verse.id)) {
            next.delete(verse.id)
          } else {
            next.add(verse.id)
          }
          return next
        })
        lastClickedIdRef.current = verse.id
        return
      }

      if (e.shiftKey && lastClickedIdRef.current !== null) {
        const startIdx = currentChapter.findIndex(
          (v) => v.id === lastClickedIdRef.current
        )
        const endIdx = currentChapter.findIndex((v) => v.id === verse.id)
        if (startIdx !== -1 && endIdx !== -1) {
          const from = Math.min(startIdx, endIdx)
          const to = Math.max(startIdx, endIdx)
          setMultiSelected((prev) => {
            const next = new Set(prev)
            for (let i = from; i <= to; i++) {
              next.add(currentChapter[i].id)
            }
            return next
          })
          return
        }
      }

      setMultiSelected(new Set())
      lastClickedIdRef.current = verse.id
      setSelectedVerseId(verse.id)
      bibleActions.selectVerse(verse)
      quickNavRef.current?.setValue(verseReference(verse))
    },
    [currentChapter]
  )

  const multiSelectedVerses = useMemo(
    () => currentChapter.filter((v) => multiSelected.has(v.id)),
    [currentChapter, multiSelected]
  )

  const handleMultiPresent = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const translation =
      translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
      "KJV"
    const renderData = toMultiVerseRenderData(multiSelectedVerses, translation)
    useBroadcastStore.getState().setLiveVerse(renderData, "manual")
    if (multiSelectedVerses.length === 1) {
      bibleActions.selectVerse(multiSelectedVerses[0])
    }
  }, [multiSelectedVerses, translations, activeTranslationId])

  const handleMultiQueue = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const store = useQueueStore.getState()
    for (const verse of multiSelectedVerses) {
      store.addItem({
        id: crypto.randomUUID(),
        verse,
        reference: verseReference(verse),
        confidence: 1,
        source: "manual",
        added_at: Date.now(),
      })
    }
    setMultiSelected(new Set())
  }, [multiSelectedVerses])

  const handleMultiQueueGroup = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const translation =
      translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
      "KJV"
    useQueueStore.getState().addItem({
      id: crypto.randomUUID(),
      verse: multiSelectedVerses[0],
      verses: multiSelectedVerses,
      reference: buildMultiVerseReference(multiSelectedVerses, translation),
      confidence: 1,
      source: "manual",
      added_at: Date.now(),
    })
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translations, activeTranslationId])

  const handleMultiAddToSchedule = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (!activeScheduleId) {
      toast.error("No active schedule — select or create one first")
      return
    }
    const schedule = scheduleStore.getActiveSchedule()
    const translation =
      translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
      "KJV"
    let insertAt =
      scheduleStore.activeItemIndex !== null
        ? scheduleStore.activeItemIndex + 1
        : (schedule?.items.length ?? 0)
    let added = 0
    for (const verse of multiSelectedVerses) {
      const item: import("@/types/schedule").ScriptureScheduleItem = {
        id: crypto.randomUUID(),
        type: "scripture",
        label: `${verseReference(verse)} (${translation})`,
        order: insertAt,
        notes: "",
        translationId: verse.translation_id,
        bookNumber: verse.book_number,
        chapter: verse.chapter,
        verseStart: verse.verse,
        verseEnd: verse.verse,
        cachedReference: `${verseReference(verse)} (${translation})`,
        cachedText: verse.text,
      }
      if (scheduleStore.insertItemAt(activeScheduleId, item, insertAt)) {
        added++
        insertAt++
      }
    }
    const skipped = multiSelectedVerses.length - added
    if (added === 0) {
      toast.info(
        skipped > 1
          ? "Those verses are already in the schedule"
          : "Already in the schedule"
      )
    } else {
      toast.success(
        `${added} verse${added > 1 ? "s" : ""} added to schedule` +
          (skipped > 0 ? ` · ${skipped} already there` : "")
      )
    }
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translations, activeTranslationId])

  const handleClearMultiSelect = useCallback(() => {
    setMultiSelected(new Set())
  }, [])

  // Arrow key navigation
  const handleKeyDown = useCallback(
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
    [chapter, currentChapter, effectiveSelectedVerseId]
  )

  return (
    <div
      ref={panelRef}
      data-slot="search-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card outline-none"
      onKeyDown={
        contentTab === "verse" && activeTab === "book"
          ? handleKeyDown
          : undefined
      }
      tabIndex={-1}
    >
      {/* Top-level content tabs: Verse / Media / Slide */}
      <div
        data-tour="quick-tabs"
        className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1.5"
      >
        {CONTENT_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              onClick={() => setContentTab(tab.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                contentTab === tab.value
                  ? "border-lime-500/50 bg-lime-500/15"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-3.5",
                  contentTab === tab.value
                    ? "text-lime-400"
                    : "text-muted-foreground"
                )}
              />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* STICKY: Book/Context tab row + search input */}
      {contentTab === "verse" && (
        <div className="flex min-h-11 shrink-0 items-center gap-0 border-b border-border">
          <div className="flex items-center gap-1 px-3 py-1.5">
            <button
              data-tour="book-search"
              onClick={() => setActiveTab("book")}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === "book"
                  ? "border-lime-500/50 bg-lime-500/15"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpenIcon
                className={cn(
                  "size-3.5",
                  activeTab === "book"
                    ? "text-lime-400"
                    : "text-muted-foreground"
                )}
              />
              Book search
            </button>
            <button
              data-tour="context-search"
              onClick={() => {
                setActiveTab("context")
                setContextQuery("")
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === "context"
                  ? "border-lime-500/50 bg-lime-500/15"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              <SparklesIcon
                className={cn(
                  "size-3.5",
                  activeTab === "context"
                    ? "text-lime-400"
                    : "text-muted-foreground"
                )}
              />
              Context search
            </button>
          </div>

          {activeTab === "book" ? (
            <QuickNavInput
              ref={quickNavRef}
              books={books}
              translations={translations}
              activeTranslationId={activeTranslationId}
            />
          ) : (
            <div className="flex flex-1 items-center gap-2 pr-3">
              <Input
                placeholder="Search verse text..."
                value={contextQuery}
                onChange={(e) => handleContextSearch(e.target.value)}
                className="h-7 flex-1 text-xs"
              />
              <Select
                value={String(activeTranslationId)}
                onValueChange={async (v) => {
                  const id = Number(v)
                  try {
                    await setActiveTranslation(id)
                    useBibleStore.getState().setActiveTranslation(id)
                  } catch (err) {
                    console.error(err)
                    toast.error("Couldn't switch translation", {
                      description: String(err),
                    })
                  }
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-7 w-[72px] shrink-0 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {translations.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.abbreviation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {/* Media tab */}
      {contentTab === "media" && <SearchMediaTab />}

      {/* Slide tab */}
      {contentTab === "slide" && <SearchSlideTab />}

      {/* Song tab */}
      {contentTab === "song" && <SearchSongTab />}

      {/* Book search tab */}
      {contentTab === "verse" && activeTab === "book" && (
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
                          ? multiSelectedVerses
                          : [verse]
                      return {
                        payload: {
                          kind: "verses" as const,
                          verses,
                          translation:
                            translations.find(
                              (t) => t.id === activeTranslationId
                            )?.abbreviation ?? "KJV",
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className={cn(
                                  "shrink-0 font-mono text-[10px] transition-opacity",
                                  lexiconOpenId === verse.id
                                    ? "bg-lime-500/20 text-lime-400"
                                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setLexiconOpenId((prev) =>
                                    prev === verse.id ? null : verse.id
                                  )
                                }}
                              >
                                {verse.book_number <= 39 ? "He" : "Gr"}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              {verse.book_number <= 39
                                ? "Hebrew interlinear"
                                : "Greek interlinear"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {/* Edit verse */}
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
                                    setEditingVerse(verse)
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
                      {queuedVerseKeys.has(
                        verseLocationKey(
                          verse.book_number,
                          verse.chapter,
                          verse.verse
                        )
                      ) ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Already in queue — scroll to it"
                                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const store = useQueueStore.getState()
                                  const idx = store.findDuplicate(
                                    verse.book_number,
                                    verse.chapter,
                                    verse.verse
                                  )
                                  if (idx !== -1) {
                                    store.flashItem(store.items[idx].id)
                                    document
                                      .querySelector(
                                        `[data-slot="queue-panel"] [data-queue-idx="${idx}"]`
                                      )
                                      ?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "nearest",
                                      })
                                  }
                                }}
                              >
                                <CheckIcon className="size-4 text-ai-direct" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              Already in queue
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Add to queue"
                                className={cn(
                                  "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                                  verse.id === effectiveSelectedVerseId
                                    ? "hover:bg-lime-500/20 hover:text-lime-500"
                                    : "bg-primary/40! text-primary-foreground hover:bg-primary!"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  useQueueStore.getState().addItem({
                                    id: crypto.randomUUID(),
                                    verse,
                                    reference: verseReference(verse),
                                    confidence: 1,
                                    source: "manual",
                                    added_at: Date.now(),
                                  })
                                }}
                              >
                                <PlusIcon className="size-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              Add to queue
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {/* Lexicon strip */}
                    {lexiconEnabled && lexiconOpenId === verse.id && (
                      <div
                        className="pl-9"
                        onClick={(e) => e.stopPropagation()}
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
            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-sky-500/10 px-3 py-2">
              <LayersIcon className="size-3.5 text-sky-400" />
              <span className="flex-1 text-xs font-medium text-sky-300">
                {multiSelected.size} verses selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
                onClick={handleMultiAddToSchedule}
              >
                <ListPlusIcon className="size-3" />
                Add to Schedule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
                onClick={handleMultiQueue}
              >
                <PlusIcon className="size-3" />
                Queue
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
                onClick={handleMultiQueueGroup}
              >
                <LayersIcon className="size-3" />
                Queue group
              </Button>
              <Button
                size="sm"
                className="h-7 gap-1.5 bg-sky-600 text-xs text-white hover:bg-sky-500"
                onClick={handleMultiPresent}
              >
                <PlayIcon className="size-3" />
                Present
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Clear selection"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleClearMultiSelect}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Context search tab — semantic AI search */}
      {contentTab === "verse" && activeTab === "context" && (
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className={cn(
                                "mr-5 ml-auto shrink-0 font-mono text-[10px] transition-opacity",
                                lexiconOpenId === lexKey
                                  ? "bg-lime-500/20 text-lime-400"
                                  : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                setLexiconOpenId((prev) =>
                                  prev === lexKey ? null : lexKey
                                )
                              }}
                            >
                              {verse.book_number <= 39 ? "He" : "Gr"}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {verse.book_number <= 39
                              ? "Hebrew interlinear"
                              : "Greek interlinear"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                    <HighlightedText
                      text={result.verse_text}
                      query={contextQuery}
                    />
                  </p>
                  {queuedVerseKeys.has(
                    verseLocationKey(
                      result.book_number,
                      result.chapter,
                      result.verse
                    )
                  ) ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="absolute top-1/2 right-2 flex size-6 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center"
                            onClick={(e) => {
                              e.stopPropagation()
                              const store = useQueueStore.getState()
                              const idx = store.findDuplicate(
                                result.book_number,
                                result.chapter,
                                result.verse
                              )
                              if (idx !== -1) {
                                store.flashItem(store.items[idx].id)
                                document
                                  .querySelector(
                                    `[data-slot="queue-panel"] [data-queue-idx="${idx}"]`
                                  )
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "nearest",
                                  })
                              }
                            }}
                          >
                            <CheckIcon className="size-4 text-ai-direct" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          Already in queue
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="absolute top-1/2 right-2 shrink-0 -translate-y-1/2 bg-primary text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/80"
                            onClick={(e) => {
                              e.stopPropagation()
                              useQueueStore.getState().addItem({
                                id: crypto.randomUUID(),
                                verse,
                                reference: verseReference(verse),
                                confidence: result.similarity,
                                source: "manual",
                                added_at: Date.now(),
                              })
                            }}
                          >
                            <PlusIcon className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          Add to queue
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
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
      )}
      {editingVerse && (
        <VerseEditModal
          open={!!editingVerse}
          onOpenChange={(open) => {
            if (!open) setEditingVerse(null)
          }}
          verse={editingVerse}
          translationAbbreviation={activeTranslationAbbr}
          translationId={activeTranslationId}
        />
      )}
    </div>
  )
}
