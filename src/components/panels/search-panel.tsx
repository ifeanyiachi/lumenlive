import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useTranslation } from "react-i18next"
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
import { useBibleStore, useSettingsStore } from "@/stores"
import { useScheduleStore } from "@/stores/schedule-store"
import { useCan } from "@/stores/entitlements-store"
import { requireFeature } from "@/components/entitlements/require-feature"
import type { Book, Verse } from "@/types"
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
import { ContextSearchInput } from "@/components/panels/search/context-search-input"
import {
  QuickNavInput,
  type QuickNavHandle,
} from "@/components/panels/search/quick-nav-input"
import { toast } from "sonner"

type SearchTab = "book" | "context"
type ContentTab = "verse" | "media" | "slide" | "song"

const CONTENT_TABS: {
  value: ContentTab
  labelKey: string
  icon: typeof BookOpenIcon
}[] = [
  { value: "verse", labelKey: "search.tabs.verse", icon: BookOpenIcon },
  { value: "media", labelKey: "search.tabs.media", icon: ImageIcon },
  { value: "slide", labelKey: "search.tabs.slide", icon: LayoutTemplateIcon },
  { value: "song", labelKey: "search.tabs.song", icon: MusicIcon },
]

export function SearchPanel() {
  const { t } = useTranslation("panels")
  const [contentTab, setContentTab] = useState<ContentTab>("verse")
  const [activeTab, setActiveTab] = useState<SearchTab>("book")
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState(1)
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null)

  // Greek/Hebrew interlinear is installed-but-disabled by default; the whole
  // affordance (toggle + strip) stays hidden until enabled in Bible settings.
  // Lexicon/word-study is a Pro feature, so it also requires the entitlement.
  const lexiconSetting = useSettingsStore((s) => s.lexiconEnabled)
  const hasLexicon = useCan("lexicon")
  const lexiconEnabled = lexiconSetting && hasLexicon
  // Context (meaning-based) search is a Starter capability; Free stays on the
  // Book-search tab. The tab is shown but locked — selecting it prompts to upgrade.
  const canContextSearch = useCan("context_search")

  // Editing verse/scripture formatting is a Starter capability. Gate the two
  // editor-open paths (single-verse formatting + multi-verse edit) so a Free
  // operator is prompted instead of the editor opening.
  const openVerseEditor = (verse: Verse) => {
    if (requireFeature("verse_editing", "Verse editing", () => setEditingVerse(verse)))
      setEditingVerse(verse)
  }
  const openMultiVerseEditor = () => {
    if (requireFeature("verse_editing", "Verse editing", () => setMultiEditOpen(true)))
      setMultiEditOpen(true)
  }
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
  const { committedQuery, handleContextSearch, resetContextSearch } =
    useContextSearch({
      activeTab,
      activeTranslationId,
    })

  // Verses already in the running order (the schedule's All tab) — used to flip
  // each row's add-to-schedule control into its "already added" state. Only exact
  // single-verse scripture items count (a verse inside a larger range is not a
  // duplicate the store would dedupe), and the key is location-based to mirror
  // the row lookup below.
  const activeSchedule = useScheduleStore((s) =>
    s.schedules.find((sc) => sc.id === s.activeScheduleId)
  )
  const scheduledVerseKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const item of activeSchedule?.items ?? []) {
      if (
        item.type === "scripture" &&
        !item.groupCollection &&
        item.verseStart === item.verseEnd
      ) {
        keys.add(
          verseLocationKey(item.bookNumber, item.chapter, item.verseStart)
        )
      }
    }
    return keys
  }, [activeSchedule])

  const selectedBookNumber = selectedBook?.book_number

  // Load initial data and default to Genesis 1:1
  useEffect(() => {
    bibleActions.loadTranslations().catch((err) => {
      console.error(err)
      toast.error(t("search.loadTranslationsFailed"), {
        description: String(err),
      })
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
        toast.error(t("search.loadBooksFailed"), { description: String(err) })
      })
    // Mount-only bootstrap: load translations/books and default to Genesis 1:1.
    // `t` is used only inside error toasts and is intentionally omitted — adding
    // it would re-run this on every UI-language change, reloading data and
    // resetting the operator's navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load chapter when book + chapter are set
  useEffect(() => {
    if (selectedBookNumber && chapter >= 1) {
      bibleActions.loadChapter(selectedBookNumber, chapter).catch((err) => {
        console.error(err)
        toast.error(t("search.loadChapterFailed"), { description: String(err) })
      })
    }
    // Reload the chapter only when the passage or Bible translation changes. `t`
    // (error toast only) is intentionally omitted so a UI-language switch does
    // not trigger a redundant chapter reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // Schedule/detection-driven navigations (focusPanel:false) have already
            // staged their own content into Program — often a multi-verse block
            // whose first verse this is. Use the raw store select so the book
            // search reflects the verse WITHOUT releasing that pin; releasing it
            // (bibleActions.selectVerse → followManualSelection) would flip Program
            // off the staged block and onto this single verse. Operator-driven
            // navigations (quick-nav / present) do release the pin so the preview
            // follows the new selection.
            if (pendingNavigation.focusPanel === false) {
              useBibleStore.getState().selectVerse(target)
            } else {
              bibleActions.selectVerse(target)
            }
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
    handleVerseDoubleClick,
    handleMultiPresent,
    handleMultiAddGroupToSchedule,
    handleMultiAddAsGroup,
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
                  ? "border-primary/50 bg-primary/15"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-3.5",
                  contentTab === tab.value
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              />
              {t(tab.labelKey)}
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
                  ? "border-primary/50 bg-primary/15"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpenIcon
                className={cn(
                  "size-3.5",
                  activeTab === "book"
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              />
              {t("search.bookSearch")}
            </button>
            <button
              data-tour="context-search"
              onClick={() => {
                if (!canContextSearch) {
                  requireFeature("context_search", "Context search", () => {
                    setActiveTab("context")
                    resetContextSearch()
                  })
                  return
                }
                setActiveTab("context")
                resetContextSearch()
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeTab === "context"
                  ? "border-primary/50 bg-primary/15"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
                !canContextSearch && "opacity-60"
              )}
            >
              <SparklesIcon
                className={cn(
                  "size-3.5",
                  activeTab === "context"
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              />
              {t("search.contextSearch")}
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
              <ContextSearchInput onSearch={handleContextSearch} />
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
          scheduledVerseKeys={scheduledVerseKeys}
          translation={activeTranslationAbbr}
          onEditVerse={openVerseEditor}
          multiSelected={multiSelected}
          handleVerseClick={handleVerseClick}
          handleVerseDoubleClick={handleVerseDoubleClick}
          onMultiAddToSchedule={handleMultiAddGroupToSchedule}
          onMultiEdit={openMultiVerseEditor}
          onMultiAddAsGroup={handleMultiAddAsGroup}
          onMultiAddSeparately={handleMultiAddToSchedule}
          onMultiPresent={handleMultiPresent}
          onMultiClear={handleClearMultiSelect}
        />
      )}

      {/* Context search tab — semantic AI search */}
      {contentTab === "verse" && activeTab === "context" && (
        <ContextSearchTab
          highlightQuery={committedQuery}
          semanticResults={semanticResults}
          activeTranslationId={activeTranslationId}
          lexiconEnabled={lexiconEnabled}
          lexiconOpenId={lexiconOpenId}
          setLexiconOpenId={setLexiconOpenId}
          scheduledVerseKeys={scheduledVerseKeys}
          translation={activeTranslationAbbr}
          onEditVerse={openVerseEditor}
          onVerseDoubleClick={handleVerseDoubleClick}
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
