import { useState, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { ColorSwatch } from "@/components/ui/color-swatch"
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

const FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const

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
  const { t } = useTranslation("slides")
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
        title={t("scriptureProperties.title")}
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Verse search */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("themeTypes.scripture")}
            </span>
            <div className="flex gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={t("scriptureProperties.searchPlaceholder")}
                className="h-7 flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="icon-sm"
                className="size-7"
                aria-label={t("scriptureProperties.search")}
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
              {t("scriptureProperties.verseText")}
            </span>
            <Textarea
              value={element.verseText}
              onChange={(e) => update({ verseText: e.target.value })}
              className="min-h-16 text-xs"
              placeholder={t("scriptureProperties.verseTextPlaceholder")}
            />
          </div>

          <PropertyRow label={t("scriptureProperties.reference")}>
            <Input
              value={element.reference}
              onChange={(e) => update({ reference: e.target.value })}
              className="h-7 text-xs"
              placeholder={t("scriptureProperties.referencePlaceholder")}
            />
          </PropertyRow>

          <Separator />

          {/* Verse styling — the body of the scripture */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("scriptureProperties.verseStyle")}
            </span>
            <PropertyRow label={t("scriptureProperties.font")}>
              <FontFamilyPicker
                value={element.fontFamily}
                onChange={(v) => update({ fontFamily: v })}
              />
            </PropertyRow>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label={t("timerProperties.size")}>
                <Input
                  type="number"
                  value={element.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={8}
                  max={200}
                />
              </PropertyRow>
              <PropertyRow label={t("properties.color")}>
                <ColorSwatch
                  value={element.color}
                  onChange={(color) => update({ color })}
                  className="h-7 w-full"
                  title={t("format.verseColor")}
                />
              </PropertyRow>
            </div>
            <PropertyRow label={t("timerProperties.weight")}>
              <Select
                value={String(element.fontWeight)}
                onValueChange={(v) => update({ fontWeight: Number(v) })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_WEIGHTS.map((weight) => (
                    <SelectItem key={weight} value={String(weight)}>
                      {t(
                        `format.${({ 300: "light", 400: "regular", 500: "medium", 600: "semibold", 700: "bold", 800: "extraBold" } as const)[weight]}`
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label={t("properties.align")}>
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
                  <SelectItem value="left">{t("properties.left")}</SelectItem>
                  <SelectItem value="center">
                    {t("properties.center")}
                  </SelectItem>
                  <SelectItem value="right">{t("properties.right")}</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label={t("scriptureProperties.case")}>
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
                  <SelectItem value="none">
                    {t("scriptureProperties.normal")}
                  </SelectItem>
                  <SelectItem value="uppercase">UPPERCASE</SelectItem>
                  <SelectItem value="lowercase">lowercase</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label={t("textProperties.lineHeight")}>
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
              {t("scriptureProperties.referenceStyle")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label={t("timerProperties.size")}>
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
              <PropertyRow label={t("properties.color")}>
                <ColorSwatch
                  value={element.referenceColor}
                  onChange={(referenceColor) => update({ referenceColor })}
                  className="h-7 w-full"
                  title={t("format.referenceColor")}
                />
              </PropertyRow>
            </div>
            <PropertyRow label={t("scriptureProperties.position")}>
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
                  <SelectItem value="above">
                    {t("scriptureProperties.aboveVerse")}
                  </SelectItem>
                  <SelectItem value="below">
                    {t("scriptureProperties.belowVerse")}
                  </SelectItem>
                  <SelectItem value="inline">
                    {t("scriptureProperties.inline")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                {t("scriptureProperties.uppercase")}
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
                {t("scriptureProperties.verseNumbers")}
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
                  <PropertyRow label={t("timerProperties.size")}>
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
                  <PropertyRow label={t("properties.color")}>
                    <ColorSwatch
                      value={element.verseNumbers.color}
                      onChange={(color) =>
                        update({
                          verseNumbers: {
                            ...element.verseNumbers!,
                            color,
                          },
                        })
                      }
                      className="h-7 w-full"
                      title={t("scriptureProperties.verseNumberColor")}
                    />
                  </PropertyRow>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {t("scriptureProperties.superscript")}
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

          {/* Verse layout — how multiple verses shown together are arranged */}
          <div className="flex items-center justify-between">
            <span className="pr-2 text-[0.6875rem] text-muted-foreground">
              {t("scriptureProperties.breakPerVerse")}
            </span>
            <Switch
              checked={element.breakPerVerse ?? false}
              onCheckedChange={(v) => update({ breakPerVerse: v })}
            />
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
