import { useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { BUILTIN_THEMES } from "@/lib/theme/builtins"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import { useScheduleStore } from "@/stores/schedule-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useSongStore } from "@/stores/song-store"
import { useThemesStore } from "@/stores/themes"
import type { SongScheduleItem } from "@/types/schedule"

const DEFAULT_THEME = "default"
const BUILTIN_SONG_THEMES = BUILTIN_THEMES.filter(
  (theme) => theme.type === "song"
)

export function SongProperties({
  item,
  scheduleId,
}: {
  item: SongScheduleItem
  scheduleId: string
}) {
  const { t } = useTranslation("schedule")
  const song = useSongStore((s) =>
    s.songs.find((entry) => entry.id === item.songId)
  )
  const defaults = useSettingsStore((s) => s.songSlideDefaults)
  const customThemes = useThemesStore((s) => s.customThemes)
  const [showPreview, setShowPreview] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)

  const themes = useMemo(
    () => [
      ...BUILTIN_SONG_THEMES,
      ...customThemes.filter((theme) => theme.type === "song"),
    ],
    [customThemes]
  )
  const inheritedThemeId = song
    ? resolveSongSlideOptions(defaults, song.slideOptions).themeId
    : defaults.themeId
  const inheritedTheme = themes.find(
    (theme) => theme.id === resolveLegacyThemeId(inheritedThemeId)
  )

  const deck = useMemo(() => {
    if (!showPreview || !song) return null
    const arrangement =
      (item.arrangementId
        ? song.arrangements.find((entry) => entry.id === item.arrangementId)
        : undefined) ??
      song.arrangements.find((entry) => entry.isDefault) ??
      song.arrangements[0]
    if (!arrangement) return null
    const base = resolveSongSlideOptions(defaults, song.slideOptions)
    const options = item.themeId ? { ...base, themeId: item.themeId } : base
    return generateSlidesFromSong(
      song,
      arrangement,
      options,
      undefined,
      undefined,
      customThemes
    )
  }, [
    showPreview,
    song,
    item.arrangementId,
    item.themeId,
    defaults,
    customThemes,
  ])
  const slides = deck?.slides ?? []
  const currentIndex = Math.min(slideIndex, slides.length - 1)
  const currentSlide = slides[currentIndex]

  return (
    <FieldGroup label={t("properties.songTheme")}>
      <Select
        value={
          item.themeId ? resolveLegacyThemeId(item.themeId) : DEFAULT_THEME
        }
        onValueChange={(themeId) => {
          useScheduleStore.getState().updateItem(scheduleId, item.id, {
            themeId: themeId === DEFAULT_THEME ? undefined : themeId,
          })
          setSlideIndex(0)
        }}
      >
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_THEME} className="text-xs">
            {t("properties.songDefaultTheme", {
              theme: inheritedTheme ? ` (${inheritedTheme.name})` : "",
            })}
          </SelectItem>
          {themes.map((theme) => (
            <SelectItem key={theme.id} value={theme.id} className="text-xs">
              {theme.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit gap-1.5 text-xs"
        aria-expanded={showPreview}
        onClick={() => setShowPreview((visible) => !visible)}
      >
        <EyeIcon className="size-3.5" />
        {showPreview
          ? t("properties.hideSongPreview")
          : t("properties.previewSongTheme")}
      </Button>

      {showPreview && (
        <div className="flex flex-col gap-2">
          {currentSlide ? (
            <>
              <SlideCanvas
                slide={currentSlide}
                className="w-full rounded-md border border-border bg-black"
              />
              {slides.length > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={t("properties.previousSongSlide")}
                    disabled={currentIndex === 0}
                    onClick={() => setSlideIndex(currentIndex - 1)}
                  >
                    <ChevronLeftIcon className="size-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("properties.songSlidePosition", {
                      current: currentIndex + 1,
                      count: slides.length,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={t("properties.nextSongSlide")}
                    disabled={currentIndex === slides.length - 1}
                    onClick={() => setSlideIndex(currentIndex + 1)}
                  >
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("properties.songPreviewUnavailable")}
            </p>
          )}
        </div>
      )}
    </FieldGroup>
  )
}
