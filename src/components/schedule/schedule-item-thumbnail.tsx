import { useRef, useEffect, useCallback, memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { PlayIcon } from "lucide-react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { getMediaType } from "@/lib/media-import"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { usePresentationStore } from "@/stores/presentation-store"
import { findOutput } from "@/lib/broadcast/output-selectors"
import { useMediaStore } from "@/stores/media-store"
import { useSongStore } from "@/stores/song-store"
import { useSettingsStore } from "@/stores/settings-store"
import {
  renderSlide,
  scriptureElementToVerseStyle,
  type ScriptureRenderPayload,
} from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { resolveScriptureTheme } from "@/lib/theme/resolve"
import { presentScripture } from "@/lib/theme/present"
import type { SlideScriptureElement } from "@/types/slide"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { slideHasAnimatedBackground } from "@/lib/slide-renderer/predicates"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import type {
  ScheduleItem,
  SlideScheduleItem,
  MediaScheduleItem,
  WebScheduleItem,
  SongScheduleItem,
  LexiconScheduleItem,
} from "@/types/schedule"
import type { MediaAsset } from "@/types/media"

const THUMB_W = 160
const THUMB_H = 78

export const ScheduleItemThumbnail = memo(function ScheduleItemThumbnail({
  item,
}: {
  item: ScheduleItem
}) {
  const { t } = useTranslation("schedule")
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
  const customThemes = useThemesStore((s) => s.customThemes)
  const mainThemeId = useBroadcastStore(
    (s) => findOutput(s.outputs, "main")?.themeId ?? ""
  )
  const scriptureTheme = useMemo(() => {
    const themes = buildThemeRegistry(customThemes)
    return (
      resolveScriptureTheme(
        item.type === "scripture" ? (item.themeId ?? mainThemeId) : mainThemeId,
        themes
      ) ?? themes.find((theme) => theme.type === "scripture")
    )
  }, [customThemes, mainThemeId, item])
  const scripturePreview = useMemo(() => {
    if (item.type !== "scripture" || !scriptureTheme) return undefined
    const fakeVerse = {
      id: 0,
      translation_id: item.translationId,
      book_number: item.bookNumber,
      book_name: item.cachedReference.split(" ")[0] ?? "John",
      book_abbreviation: item.cachedReference.split(" ")[0] ?? "Jhn",
      chapter: item.chapter,
      verse: item.verseStart,
      text: item.cachedText || item.cachedReference,
    }
    const abbr = item.cachedReference.match(/\(([^)]+)\)/)?.[1] ?? "KJV"
    const renderData = toVerseRenderData(fakeVerse, abbr)
    const slide = presentScripture(
      scriptureTheme,
      { type: "scripture", verse: renderData },
      () => "thumb-scripture"
    )[0].slide
    const el = slide.elements.find((e) => e.type === "scripture") as
      SlideScriptureElement | undefined
    const scriptureContent = el
      ? new Map<string, ScriptureRenderPayload>([
          [
            el.id,
            {
              verse: renderData,
              style: scriptureElementToVerseStyle(el),
              options: {
                scale: 1,
                verseAutoFit: false,
                maxVerseScale: 1,
                minVerseFontSize: 40,
              },
            },
          ],
        ])
      : undefined
    return { slide, scriptureContent }
  }, [item, scriptureTheme])
  const songSlide = useMemo(() => {
    if (item.type !== "song" || !song) return undefined
    const arrangement =
      (item.arrangementId
        ? song.arrangements.find((a) => a.id === item.arrangementId)
        : undefined) ??
      song.arrangements.find((a) => a.isDefault) ??
      song.arrangements[0]
    if (!arrangement) return undefined
    const base = resolveSongSlideOptions(songSlideDefaults, song.slideOptions)
    const options = item.themeId ? { ...base, themeId: item.themeId } : base
    return generateSlidesFromSong(
      song,
      arrangement,
      options,
      undefined,
      undefined,
      customThemes
    ).slides[0]
  }, [item, song, songSlideDefaults, customThemes])
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
        if (!scripturePreview) break
        renderSlide(
          ctx,
          scripturePreview.slide,
          w,
          h,
          getSlideImageCache(),
          undefined,
          {
            scriptureContent: scripturePreview.scriptureContent,
            frameTime: performance.now(),
          }
        )
        break
      }
      case "slide": {
        const si = item as SlideScheduleItem
        const slide = presentation?.slides[si.slideIndex]
        if (slide) {
          renderSlide(ctx, slide, w, h, getSlideImageCache(), undefined, {
            frameTime: performance.now(),
          })
          if (slide.background.type === "image" && slide.background.imageUrl) {
            ensureSlideImages(slide.background.imageUrl, () =>
              drawRef.current()
            )
          }
        } else {
          ctx.fillStyle = "#555"
          ctx.font = "16px Inter, sans-serif"
          ctx.textAlign = "center"
          ctx.fillText(t("thumbnail.noSlide"), w / 2, h / 2)
        }
        break
      }
      case "media": {
        const asset = mediaAsset
        if (asset?.type === "image") {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0, w, h)
          img.src = safeFileSrc(asset.filePath)
        } else if (asset?.type === "video") {
          const video = document.createElement("video")
          video.muted = true
          video.playsInline = true
          video.src = safeFileSrc(asset.filePath)
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
          ctx.fillText(t("thumbnail.noMedia"), w / 2, h / 2)
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
        ctx.fillText(wi.url || t("itemTypes.web"), w / 2, h / 2 + 20, w - 16)
        break
      }
      case "song": {
        if (songSlide) {
          renderSlide(ctx, songSlide, w, h, getSlideImageCache(), undefined, {
            frameTime: performance.now(),
          })
          break
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
  }, [item, presentation, mediaAsset, scripturePreview, songSlide, t])

  useEffect(() => {
    drawRef.current = draw
    draw()
    const animated =
      (item.type === "slide" &&
        !!presentation?.slides[item.slideIndex] &&
        slideHasAnimatedBackground(presentation.slides[item.slideIndex])) ||
      (item.type === "song" &&
        !!songSlide &&
        slideHasAnimatedBackground(songSlide)) ||
      (item.type === "scripture" &&
        scriptureTheme?.background.type === "animated")
    if (!animated) return
    let raf = 0
    let lastFrame = 0
    const tick = (time: number) => {
      if (time - lastFrame >= 1000 / 30) {
        draw()
        lastFrame = time
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [draw, item, presentation, songSlide, scriptureTheme])

  if (item.type === "media") {
    return <ScheduleMediaThumbnail item={item} asset={mediaAsset} />
  }

  return (
    <canvas
      ref={canvasRef}
      className="block size-full rounded-[3px]"
      style={{ width: THUMB_W, height: THUMB_H }}
    />
  )
})

/**
 * Media thumbnails use the same direct image/video path as the media panel and
 * quick-add cards. Canvas-backed video thumbnails can remain blank when seeking
 * to time zero does not emit a `seeked` event, and schedule imports may only have
 * their cached path until the library finishes hydrating.
 */
function ScheduleMediaThumbnail({
  item,
  asset,
}: {
  item: MediaScheduleItem
  asset: MediaAsset | undefined
}) {
  const { t } = useTranslation("schedule")
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false)
  const filePath = asset?.filePath ?? item.cachedFilePath
  const mediaType =
    asset?.type ??
    item.cachedMediaType ??
    (item.cachedFilePath ? getMediaType(item.cachedFilePath) : null)

  const thumbSrc = useMemo(() => {
    if (asset?.thumbnailDataUrl) return asset.thumbnailDataUrl
    if (mediaType === "image" && filePath) return safeFileSrc(filePath)
    return null
  }, [asset?.thumbnailDataUrl, filePath, mediaType])

  const videoSrc = useMemo(
    () => (mediaType === "video" && filePath ? safeFileSrc(filePath) : null),
    [filePath, mediaType]
  )

  return (
    <div
      className="relative block size-full overflow-hidden rounded-[3px] bg-muted"
      style={{ width: THUMB_W, height: THUMB_H }}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={item.label}
          className="size-full object-cover"
        />
      ) : videoSrc && !videoPreviewFailed ? (
        <>
          <video
            src={videoSrc}
            aria-label={item.label}
            className="size-full object-cover"
            muted
            playsInline
            preload="auto"
            onError={() => setVideoPreviewFailed(true)}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(1, video.duration * 0.1)
              }
            }}
          />
          <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
            <PlayIcon className="ml-px size-2 fill-current" />
          </span>
        </>
      ) : (
        <div className="flex size-full items-center justify-center text-[0.625rem] text-muted-foreground">
          {mediaType === "video"
            ? "Video"
            : mediaType === "image"
              ? "Image"
              : t("thumbnail.noMedia")}
        </div>
      )}
    </div>
  )
}
