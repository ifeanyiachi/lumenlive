import { useState, useCallback, useEffect } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon, SearchIcon, BookOpenIcon } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { usePresentationStore } from "@/stores/presentation-store"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import { useBibleStore } from "@/stores"
import type { Verse, Book } from "@/types"
import type { SlideScriptureElement } from "@/types/slide"

function parseReference(
  input: string,
  books: Book[]
): { bookNumber: number; chapter: number; verse: number } | null {
  const match = input.trim().match(/^(.+?)\s+(\d+):(\d+)$/)
  if (!match) return null
  const [, bookName, ch, vs] = match
  const lower = bookName.toLowerCase()
  const book = books.find(
    (b) =>
      b.name.toLowerCase() === lower ||
      b.abbreviation.toLowerCase() === lower ||
      b.name.toLowerCase().startsWith(lower)
  )
  if (!book) return null
  return {
    bookNumber: book.book_number,
    chapter: Number(ch),
    verse: Number(vs),
  }
}

function PropertyRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export function SlideScriptureProperties({
  element,
}: {
  element: SlideScriptureElement
}) {
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  const translations = useBibleStore((s) => s.translations)
  const books = useBibleStore((s) => s.books)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Verse[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (books.length === 0 && activeTranslationId) {
      invoke<Book[]>("list_books", { translationId: activeTranslationId })
        .then((b) => useBibleStore.getState().setBooks(b))
        .catch(() => {})
    }
  }, [books.length, activeTranslationId])

  const update = (updates: Partial<SlideScriptureElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const applyVerse = useCallback(
    (verse: Verse) => {
      const translation = translations.find(
        (t) => t.id === verse.translation_id
      )
      usePresentationStore.getState().updateDraftElement(element.id, {
        reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
        verseText: verse.text,
        translation: translation?.abbreviation ?? "",
      })
    },
    [translations, element.id]
  )

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const parsed = parseReference(searchQuery, books)
      if (parsed) {
        const verse = await invoke<Verse | null>("get_verse", {
          translationId: activeTranslationId,
          bookNumber: parsed.bookNumber,
          chapter: parsed.chapter,
          verse: parsed.verse,
        })
        if (verse) {
          applyVerse(verse)
          setSearchResults([])
          setSearchQuery("")
          setSearching(false)
          return
        }
      }
      const results = await invoke<Verse[]>("search_verses", {
        query: searchQuery.trim(),
        translationId: activeTranslationId,
        limit: 15,
      })
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [searchQuery, activeTranslationId, books, applyVerse])

  const handleSelectVerse = (verse: Verse) => {
    applyVerse(verse)
    setSearchResults([])
    setSearchQuery("")
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Scripture Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Verse search */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Scripture
            </span>
            <div className="flex gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search verse (e.g. John 3:16)..."
                className="h-7 flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="icon-sm"
                className="size-7"
                aria-label="Search scripture"
                onClick={handleSearch}
                disabled={searching}
              >
                <SearchIcon className="size-3" />
              </Button>
            </div>

            {searchResults.length > 0 && (
              <ScrollArea className="max-h-40 rounded border border-border">
                <div className="flex flex-col gap-0.5 p-1">
                  {searchResults.map((verse) => (
                    <button
                      key={`${verse.book_number}-${verse.chapter}-${verse.verse}`}
                      type="button"
                      className="rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => handleSelectVerse(verse)}
                    >
                      <span className="font-medium text-foreground">
                        {verse.book_name} {verse.chapter}:{verse.verse}
                      </span>
                      <span className="ml-1.5 text-muted-foreground">
                        {verse.text.slice(0, 80)}
                        {verse.text.length > 80 ? "..." : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {element.reference && (
              <div className="flex items-center gap-1.5 rounded bg-primary/5 px-2 py-1.5">
                <BookOpenIcon className="size-3 shrink-0 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  {element.reference}
                </span>
                {element.translation && (
                  <span className="text-[0.625rem] text-muted-foreground">
                    ({element.translation})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Verse text (editable) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Verse Text
            </span>
            <Textarea
              value={element.verseText}
              onChange={(e) => update({ verseText: e.target.value })}
              className="min-h-16 text-xs"
              placeholder="Verse text..."
            />
          </div>

          <PropertyRow label="Reference">
            <Input
              value={element.reference}
              onChange={(e) => update({ reference: e.target.value })}
              className="h-7 text-xs"
              placeholder="e.g. John 3:16"
            />
          </PropertyRow>

          <Separator />

          {/* Spacing */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Spacing
            </span>
            <PropertyRow label="Line Height">
              <Slider
                value={[element.lineHeight]}
                onValueChange={([v]) => update({ lineHeight: v })}
                min={0.8}
                max={2.5}
                step={0.1}
              />
            </PropertyRow>
            <PropertyRow label="Ref Size">
              <Input
                type="number"
                value={element.referenceFontSize}
                onChange={(e) =>
                  update({ referenceFontSize: Number(e.target.value) })
                }
                className="h-7 text-xs"
                min={8}
                max={120}
              />
            </PropertyRow>
          </div>

          <Separator />

          {/* Shadow */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Shadow
              </span>
              <Button
                variant={element.shadow ? "default" : "outline"}
                size="icon-sm"
                className="size-5 text-[0.5625rem]"
                onClick={() =>
                  update({
                    shadow: element.shadow
                      ? undefined
                      : {
                          offsetX: 2,
                          offsetY: 2,
                          blur: 4,
                          color: "rgba(0,0,0,0.5)",
                        },
                  })
                }
              >
                {element.shadow ? "On" : "Off"}
              </Button>
            </div>
            {element.shadow && (
              <>
                <PropertyRow label="Blur">
                  <Slider
                    value={[element.shadow.blur]}
                    onValueChange={([v]) =>
                      update({ shadow: { ...element.shadow!, blur: v } })
                    }
                    min={0}
                    max={50}
                    step={1}
                  />
                </PropertyRow>
                <PropertyRow label="Color">
                  <Input
                    value={element.shadow.color}
                    onChange={(e) =>
                      update({
                        shadow: { ...element.shadow!, color: e.target.value },
                      })
                    }
                    className="h-7 text-xs"
                  />
                </PropertyRow>
              </>
            )}
          </div>

          <Separator />

          {/* Position & Size */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Position & Size (%)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label="X">
                <Input
                  type="number"
                  value={element.x}
                  onChange={(e) => update({ x: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={0}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="Y">
                <Input
                  type="number"
                  value={element.y}
                  onChange={(e) => update({ y: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={0}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="W">
                <Input
                  type="number"
                  value={element.width}
                  onChange={(e) => update({ width: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={1}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="H">
                <Input
                  type="number"
                  value={element.height}
                  onChange={(e) => update({ height: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={1}
                  max={100}
                />
              </PropertyRow>
            </div>
          </div>

          <ElementAnimationProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
