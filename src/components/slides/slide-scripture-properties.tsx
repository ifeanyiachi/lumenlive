import { useState, useCallback, useEffect } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon, SearchIcon, BookOpenIcon } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { usePresentationStore } from "@/stores/presentation-store"
import { FontFamilyPicker } from "@/components/shared/font-family-picker"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import {
  PropertyRow,
  ShadowSection,
  OutlineSection,
  PositionSizeSection,
} from "@/components/slides/element-property-sections"
import { useBibleStore } from "@/stores"
import type { Verse, Book } from "@/types"
import type { SlideScriptureElement } from "@/types/slide"

const FONT_WEIGHTS: { value: number; label: string }[] = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
]

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

          {/* Verse styling — the body of the scripture */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Verse Style
            </span>
            <PropertyRow label="Font">
              <FontFamilyPicker
                value={element.fontFamily}
                onChange={(v) => update({ fontFamily: v })}
              />
            </PropertyRow>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label="Size">
                <Input
                  type="number"
                  value={element.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={8}
                  max={200}
                />
              </PropertyRow>
              <PropertyRow label="Color">
                <input
                  type="color"
                  value={element.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-border"
                  aria-label="Verse color"
                />
              </PropertyRow>
            </div>
            <PropertyRow label="Weight">
              <Select
                value={String(element.fontWeight)}
                onValueChange={(v) => update({ fontWeight: Number(v) })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_WEIGHTS.map((w) => (
                    <SelectItem key={w.value} value={String(w.value)}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label="Align">
              <Select
                value={element.horizontalAlign}
                onValueChange={(v) =>
                  update({
                    horizontalAlign:
                      v as SlideScriptureElement["horizontalAlign"],
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label="Case">
              <Select
                value={element.textTransform ?? "none"}
                onValueChange={(v) =>
                  update({
                    textTransform: v as SlideScriptureElement["textTransform"],
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Normal</SelectItem>
                  <SelectItem value="uppercase">UPPERCASE</SelectItem>
                  <SelectItem value="lowercase">lowercase</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label="Line Height">
              <Slider
                value={[element.lineHeight]}
                onValueChange={([v]) => update({ lineHeight: v })}
                min={0.8}
                max={2.5}
                step={0.1}
              />
            </PropertyRow>
          </div>

          <Separator />

          {/* Reference styling — the citation label (e.g. John 3:16) */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Reference Style
            </span>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label="Size">
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
              <PropertyRow label="Color">
                <input
                  type="color"
                  value={element.referenceColor}
                  onChange={(e) => update({ referenceColor: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-border"
                  aria-label="Reference color"
                />
              </PropertyRow>
            </div>
            <PropertyRow label="Position">
              <Select
                value={element.referencePosition ?? "below"}
                onValueChange={(v) =>
                  update({
                    referencePosition:
                      v as SlideScriptureElement["referencePosition"],
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Above verse</SelectItem>
                  <SelectItem value="below">Below verse</SelectItem>
                  <SelectItem value="inline">Inline</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                Uppercase
              </span>
              <Switch
                checked={element.referenceUppercase ?? false}
                onCheckedChange={(v) => update({ referenceUppercase: v })}
              />
            </div>
          </div>

          <Separator />

          {/* Verse numbers — superscript markers before each verse */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Verse Numbers
              </span>
              <Switch
                checked={element.verseNumbers?.visible ?? false}
                onCheckedChange={(v) =>
                  update({
                    verseNumbers: {
                      fontSize:
                        element.verseNumbers?.fontSize ??
                        Math.round(element.fontSize * 0.5),
                      color: element.verseNumbers?.color ?? element.color,
                      superscript: element.verseNumbers?.superscript ?? true,
                      visible: v,
                    },
                  })
                }
              />
            </div>
            {element.verseNumbers?.visible && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <PropertyRow label="Size">
                    <Input
                      type="number"
                      value={element.verseNumbers.fontSize}
                      onChange={(e) =>
                        update({
                          verseNumbers: {
                            ...element.verseNumbers!,
                            fontSize: Number(e.target.value),
                          },
                        })
                      }
                      className="h-7 text-xs"
                      min={6}
                      max={80}
                    />
                  </PropertyRow>
                  <PropertyRow label="Color">
                    <input
                      type="color"
                      value={element.verseNumbers.color}
                      onChange={(e) =>
                        update({
                          verseNumbers: {
                            ...element.verseNumbers!,
                            color: e.target.value,
                          },
                        })
                      }
                      className="h-7 w-full cursor-pointer rounded border border-border"
                      aria-label="Verse number color"
                    />
                  </PropertyRow>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.6875rem] text-muted-foreground">
                    Superscript
                  </span>
                  <Switch
                    checked={element.verseNumbers.superscript}
                    onCheckedChange={(v) =>
                      update({
                        verseNumbers: {
                          ...element.verseNumbers!,
                          superscript: v,
                        },
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>

          <Separator />

          <ShadowSection
            shadow={element.shadow}
            onChange={(shadow) => update({ shadow })}
          />

          <Separator />

          <OutlineSection
            outline={element.outline}
            onChange={(outline) => update({ outline })}
          />

          <Separator />

          <PositionSizeSection rect={element} onChange={update} />

          <ElementAnimationProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
