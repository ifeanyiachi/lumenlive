import { useState, useEffect, useCallback, useRef, useMemo } from "react"
// Using native overflow-y-auto instead of Radix ScrollArea for reliable scrolling in flex layouts
import { cn } from "@/lib/utils"
import {
  BookOpenIcon,
  SparklesIcon,
  ImageIcon,
  LayoutTemplateIcon,
  MusicIcon,
} from "lucide-react"
import { useBible, bibleActions } from "@/hooks/use-bible"
import { useBibleStore, useQueueStore, useSettingsStore } from "@/stores"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import type { Book, Verse } from "@/types"
import { Input } from "@/components/ui/input"
import { SearchMediaTab } from "@/components/panels/search-media-tab"
import { SearchSlideTab } from "@/components/panels/search-slide-tab"
import { SearchSongTab } from "@/components/panels/search-song-tab"
import { VerseEditModal } from "@/components/verse-edit/verse-edit-modal"
import { MultiVerseEditModal } from "@/components/verse-edit/multi-verse-edit-modal"
import { useContextSearch } from "@/hooks/use-context-search"
import { verseLocationKey, verseReference } from "@/lib/search/verse-keys"
import { resolveEffectiveVerseId } from "@/lib/search/verse-selection"
import { TranslationSelect } from "@/components/panels/search/translation-select"
import { useVerseMultiselect } from "@/hooks/use-verse-multiselect"
import { useVerseListKeyboard } from "@/hooks/use-verse-list-keyboard"
import { BookSearchTab } from "@/components/panels/search/book-search-tab"
import { ContextSearchTab } from "@/components/panels/search/context-search-tab"
import {
  QuickNavInput,
  type QuickNavHandle,
} from "@/components/panels/search/quick-nav-input"
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

export function SearchPanel() {
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
  const [multiEditOpen, setMultiEditOpen] = useState(false)

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

  const {
    multiSelected,
    setMultiSelected,
    multiSelectedVerses,
    handleVerseClick,
    handleMultiPresent,
    handleMultiAddGroupToSchedule,
    handleMultiAddToSchedule,
    handleClearMultiSelect,
  } = useVerseMultiselect({
    currentChapter,
    translations,
    activeTranslationId,
    quickNavRef,
    setSelectedVerseId,
    resetKey: `${selectedBook?.book_number ?? "none"}:${chapter}`,
  })

  const handleKeyDown = useVerseListKeyboard({
    chapter,
    currentChapter,
    effectiveSelectedVerseId,
    setChapter,
    setSelectedVerseId,
    quickNavRef,
  })

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
              <TranslationSelect
                translations={translations}
                activeTranslationId={activeTranslationId}
              />
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
        <BookSearchTab
          selectedBook={selectedBook}
          chapter={chapter}
          setChapter={setChapter}
          setSelectedVerseId={setSelectedVerseId}
          currentChapter={currentChapter}
          effectiveSelectedVerseId={effectiveSelectedVerseId}
          translations={translations}
          activeTranslationId={activeTranslationId}
          lexiconEnabled={lexiconEnabled}
          lexiconOpenId={lexiconOpenId}
          setLexiconOpenId={setLexiconOpenId}
          queuedVerseKeys={queuedVerseKeys}
          verseEdits={verseEdits}
          onEditVerse={setEditingVerse}
          multiSelected={multiSelected}
          handleVerseClick={handleVerseClick}
          onMultiAddToSchedule={handleMultiAddToSchedule}
          onMultiEdit={() => setMultiEditOpen(true)}
          onMultiAddGroupToSchedule={handleMultiAddGroupToSchedule}
          onMultiPresent={handleMultiPresent}
          onMultiClear={handleClearMultiSelect}
        />
      )}

      {/* Context search tab — semantic AI search */}
      {contentTab === "verse" && activeTab === "context" && (
        <ContextSearchTab
          contextQuery={contextQuery}
          semanticResults={semanticResults}
          translations={translations}
          activeTranslationId={activeTranslationId}
          lexiconEnabled={lexiconEnabled}
          lexiconOpenId={lexiconOpenId}
          setLexiconOpenId={setLexiconOpenId}
          queuedVerseKeys={queuedVerseKeys}
        />
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
      {multiEditOpen && multiSelectedVerses.length > 0 && (
        <MultiVerseEditModal
          open={multiEditOpen}
          onOpenChange={setMultiEditOpen}
          verses={multiSelectedVerses}
          translationAbbreviation={activeTranslationAbbr}
          onApplied={() => setMultiSelected(new Set())}
        />
      )}
    </div>
  )
}
