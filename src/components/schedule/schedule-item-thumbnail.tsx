import { useRef, useEffect, useCallback, memo } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { usePresentationStore } from "@/stores/presentation-store"
import { useMediaStore } from "@/stores/media-store"
import { useSongStore } from "@/stores/song-store"
import { useSettingsStore } from "@/stores/settings-store"
import { renderVerse } from "@/lib/verse-renderer"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import type {
  ScheduleItem,
  ScriptureScheduleItem,
  SlideScheduleItem,
  MediaScheduleItem,
  WebScheduleItem,
  SongScheduleItem,
  LexiconScheduleItem,
} from "@/types/schedule"

const THUMB_W = 160
const THUMB_H = 78

export const ScheduleItemThumbnail = memo(function ScheduleItemThumbnail({
  item,
}: {
  item: ScheduleItem
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Narrow subscriptions to just the one deck/asset this thumbnail draws, so an
  // unrelated presentation or media edit doesn't re-render every thumbnail.
  const presentation = usePresentationStore((s) =>
    item.type === "slide"
      ? s.presentations.find(
          (p) => p.id === (item as SlideScheduleItem).presentationId
        )
      : undefined
  )
  const mediaAsset = useMediaStore((s) =>
    item.type === "media"
      ? s.assets.find((a) => a.id === (item as MediaScheduleItem).mediaAssetId)
      : undefined
  )
  const song = useSongStore((s) =>
    item.type === "song"
      ? s.songs.find((a) => a.id === (item as SongScheduleItem).songId)
      : undefined
  )
  // Re-render the song thumbnail if the global default theme changes.
  const songSlideDefaults = useSettingsStore((s) => s.songSlideDefaults)
  const customSlideThemes = usePresentationStore((s) => s.customSlideThemes)
  // Holds the latest draw so the async image-load callback can redraw without
  // draw() referencing itself (which the compiler flags and risks stale closures).
  const drawRef = useRef<() => void>(() => {})

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = THUMB_W * 2
    canvas.height = THUMB_H * 2
    const w = THUMB_W * 2
    const h = THUMB_H * 2

    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, w, h)

    switch (item.type) {
      case "scripture": {
        const si = item as ScriptureScheduleItem
        const themes = useBroadcastStore.getState().themes
        const activeThemeId =
          useBroadcastStore.getState().outputs.find((o) => o.id === "main")
            ?.themeId ?? ""
        const theme = themes.find((t) => t.id === activeThemeId) ?? themes[0]
        if (!theme) break
        const fakeVerse = {
          id: 0,
          translation_id: si.translationId,
          book_number: si.bookNumber,
          book_name: si.cachedReference.split(" ")[0] ?? "John",
          book_abbreviation: si.cachedReference.split(" ")[0] ?? "Jhn",
          chapter: si.chapter,
          verse: si.verseStart,
          text: si.cachedText || si.cachedReference,
        }
        const abbr = si.cachedReference.match(/\(([^)]+)\)/)?.[1] ?? "KJV"
        const renderData = toVerseRenderData(fakeVerse, abbr)
        renderVerse(ctx, theme, renderData, { scale: w / 1920 })
        break
      }
      case "slide": {
        const si = item as SlideScheduleItem
        const slide = presentation?.slides[si.slideIndex]
        if (slide) {
          renderSlide(ctx, slide, w, h, getSlideImageCache())
          if (slide.background.type === "image" && slide.background.imageUrl) {
            ensureSlideImages(slide.background.imageUrl, () =>
              drawRef.current()
            )
          }
        } else {
          ctx.fillStyle = "#555"
          ctx.font = "16px Inter, sans-serif"
          ctx.textAlign = "center"
          ctx.fillText("No slide", w / 2, h / 2)
        }
        break
      }
      case "media": {
        const asset = mediaAsset
        if (asset?.type === "image") {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0, w, h)
          img.src = convertFileSrc(asset.filePath)
        } else if (asset?.type === "video") {
          const video = document.createElement("video")
          video.muted = true
          video.playsInline = true
          video.src = convertFileSrc(asset.filePath)
          video.onloadeddata = () => {
            video.currentTime = 0
          }
          video.onseeked = () => ctx.drawImage(video, 0, 0, w, h)
        } else if (asset?.type === "audio") {
          ctx.fillStyle = "#111"
          ctx.fillRect(0, 0, w, h)
          ctx.fillStyle = "#666"
          ctx.font = "bold 40px Inter, sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.fillText("♪", w / 2, h / 2 - 10)
        } else {
          ctx.fillStyle = "#555"
          ctx.font = "14px Inter, sans-serif"
          ctx.textAlign = "center"
          ctx.fillText("No media", w / 2, h / 2)
        }
        break
      }
      case "web": {
        const wi = item as WebScheduleItem
        ctx.fillStyle = "#0c1929"
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = "#38bdf8"
        ctx.font = "bold 36px Inter, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("🌐", w / 2, h / 2 - 16)
        ctx.fillStyle = "#94a3b8"
        ctx.font = "14px Inter, sans-serif"
        ctx.fillText(wi.url || "Web", w / 2, h / 2 + 20, w - 16)
        break
      }
      case "song": {
        const si = item as SongScheduleItem
        const arrangement = song
          ? ((si.arrangementId
              ? song.arrangements.find((a) => a.id === si.arrangementId)
              : undefined) ??
            song.arrangements.find((a) => a.isDefault) ??
            song.arrangements[0])
          : undefined
        if (song && arrangement) {
          const base = resolveSongSlideOptions(
            songSlideDefaults,
            song.slideOptions
          )
          const options = si.themeId ? { ...base, themeId: si.themeId } : base
          const slide = generateSlidesFromSong(
            song,
            arrangement,
            options,
            undefined,
            undefined,
            customSlideThemes
          ).slides[0]
          if (slide) {
            renderSlide(ctx, slide, w, h, getSlideImageCache())
            break
          }
        }
        ctx.fillStyle = "#1a1a2e"
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = "#a5b4fc"
        ctx.font = "bold 40px Inter, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText("♪", w / 2, h / 2)
        break
      }
      case "lexicon": {
        const slide = (item as LexiconScheduleItem).slide
        renderSlide(ctx, slide, w, h, getSlideImageCache())
        // The card is an inline image element (a data URL); ensure it is loaded
        // into the shared cache, then redraw once it is ready.
        for (const el of slide.elements) {
          if (el.type === "image" && el.imageUrl) {
            ensureSlideImages(el.imageUrl, () => drawRef.current())
          }
        }
        break
      }
      case "header": {
        ctx.fillStyle = "#333"
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = "#fff"
        ctx.font = "bold 24px Inter, sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(item.label, w / 2, h / 2, w - 16)
        break
      }
    }
  }, [
    item,
    presentation,
    mediaAsset,
    song,
    songSlideDefaults,
    customSlideThemes,
  ])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="block size-full rounded-[3px]"
      style={{ width: THUMB_W, height: THUMB_H }}
    />
  )
})
