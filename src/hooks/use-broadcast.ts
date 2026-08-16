import { useBroadcastStore } from "@/stores/broadcast-store"
import { findOutput } from "@/lib/broadcast/output-selectors"
import { useBibleStore, useQueueStore } from "@/stores"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { bibleActions } from "@/hooks/use-bible"
import { toMultiVerseRenderData } from "@/lib/multi-verse"
import { verseEditKey } from "@/types/verse-edit"
import type { VerseRenderData, QueueItem, DetectionResult } from "@/types"
import type { Verse } from "@/types"
import type { StyledVerseSegment } from "@/types/verse-edit"
import type { Slide } from "@/types/slide"
import type { MediaAsset } from "@/types/media"
import type {
  MediaLayerState,
  LiveMedia,
  LiveWeb,
} from "@/stores/broadcast-store"
import type { WebScheduleItem } from "@/types/schedule"
import { buildDisplayUrl, extractVideoId, isYouTubeUrl } from "@/lib/youtube"

export function toVerseRenderData(
  verse: Verse,
  translation: string,
  interlinearText?: string | null,
  styledSegments?: StyledVerseSegment[]
): VerseRenderData {
  if (!styledSegments) {
    const editKey = verseEditKey(
      verse.translation_id,
      verse.book_number,
      verse.chapter,
      verse.verse
    )
    const savedEdit = useVerseEditStore.getState().getEdit(editKey)
    if (savedEdit) {
      styledSegments = savedEdit.segments
    }
  }

  if (styledSegments && styledSegments.length > 0) {
    return {
      reference: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
      segments: styledSegments,
    }
  }
  return {
    reference: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
    segments: [
      {
        verseNumber: verse.verse,
        text: interlinearText ?? verse.text,
        isInterlinear: !!interlinearText,
      },
    ],
  }
}

export function deriveLiveVerse({
  isLive,
  selectedVerse,
  translation,
  interlinearText,
}: {
  isLive: boolean
  selectedVerse: Verse | null
  translation: string
  interlinearText?: string | null
}): VerseRenderData | null {
  if (!isLive || !selectedVerse) return null
  return toVerseRenderData(selectedVerse, translation, interlinearText)
}

/**
 * Stage a queue item into the Program preview — the shared "present" step for
 * an AI-detections / queue verse. It marks the row active, mirrors the verse
 * into the book search, and pins the preview to the "queue" source. It never
 * touches the audience: the operator commits it with takeToLive (play / Enter /
 * Go Live). Shared by the queue panel's row click and the keyboard path so both
 * stage identically.
 */
export function presentQueueVerse(item: QueueItem, index: number): void {
  useQueueStore.getState().setActive(index)
  bibleActions.selectVerse(item.verse)
  const bible = useBibleStore.getState()
  const translation =
    bible.translations.find((t) => t.id === bible.activeTranslationId)
      ?.abbreviation ?? "KJV"
  const renderData = item.verses
    ? toMultiVerseRenderData(item.verses, translation)
    : toVerseRenderData(item.verse, translation)
  useBroadcastStore.getState().setLiveVerse(renderData, "queue")
}

/**
 * Stage a queued verse into the Program preview and immediately take it live.
 * This is the double-click / "send live" path for the AI-verses queue: it
 * reuses presentQueueVerse for identical staging, then commits with takeToLive
 * so the audience push matches the manual "Go Live" exactly. Single-click still
 * only stages (presentQueueVerse); this is the deliberate one-step live call.
 */
export function presentQueueVerseLive(item: QueueItem, index: number): void {
  presentQueueVerse(item, index)
  useBroadcastStore.getState().takeToLive()
}

/**
 * Present an AI detection straight to the audience. This is the deliberate
 * exception to the locked-by-default "stage-then-take" flow: queue/schedule
 * presents stage into the Program preview and wait for an explicit take, but an
 * AI-detection Present is the operator's live call, so it stages the verse and
 * commits it live in one step. It also mirrors the verse into the book search
 * and selection like the other present paths.
 */
export function presentDetectionLive(detection: DetectionResult): void {
  const bible = useBibleStore.getState()
  const verse: Verse = {
    id: 0,
    translation_id: bible.activeTranslationId,
    book_number: detection.book_number,
    book_name: detection.book_name,
    book_abbreviation: "",
    chapter: detection.chapter,
    verse: detection.verse,
    text: detection.verse_text,
  }
  bibleActions.selectVerse(verse)
  if (detection.book_number > 0) {
    bibleActions.navigateToVerse(
      detection.book_number,
      detection.chapter,
      detection.verse
    )
  }
  const translation =
    bible.translations.find((t) => t.id === bible.activeTranslationId)
      ?.abbreviation ?? "KJV"
  const bs = useBroadcastStore.getState()
  // Stage then immediately take: reuse the exact live-push path the manual
  // "Go Live" uses, so the audience push is identical.
  bs.setLiveVerse(toVerseRenderData(verse, translation), "queue")
  bs.takeToLive()
}

export async function presentSlide(slide: Slide): Promise<void> {
  const bs = useBroadcastStore.getState()
  bs.setLiveSlide(slide, "schedule")
  bs.syncStageOutput()
}

/** Per-media playback config sourced from a schedule item (trim/loop/end-action/markers). */
export type MediaPlaybackConfig = Pick<
  LiveMedia,
  | "trimStart"
  | "trimEnd"
  | "loop"
  | "endAction"
  | "markers"
  | "fit"
  | "zoom"
  | "focalX"
  | "focalY"
  | "containBackground"
  | "containBackgroundColor"
>

export async function presentMedia(
  asset: MediaAsset,
  config?: MediaPlaybackConfig
): Promise<void> {
  const media: LiveMedia = {
    filePath: asset.filePath,
    mediaType: asset.type,
    name: asset.name,
    ...config,
  }
  const bs = useBroadcastStore.getState()
  bs.setLiveMedia(media, "schedule")
  bs.syncStageOutput()
}

export async function presentWeb(item: WebScheduleItem): Promise<void> {
  const muted = useBroadcastStore.getState().broadcastMuted
  const url = buildDisplayUrl(item.url, {
    autoplay: item.autoplay,
    startTime: item.startTime,
    mute: muted,
  })
  useBroadcastStore.getState().setLiveWeb(
    {
      url,
      isYouTube: item.isYouTube,
      videoId: item.videoId,
      isLive: item.isLive,
      startTime: item.startTime,
      endTime: item.endTime,
      endAction: item.endAction,
      markers: item.markers,
      autoplay: item.autoplay,
    },
    "schedule"
  )
}

/** Playback config carried onto a live web item (mirrors the media path). */
export type WebPlaybackConfig = Pick<
  LiveWeb,
  "isLive" | "startTime" | "endTime" | "endAction" | "markers"
>

export async function presentWebUrl(
  rawUrl: string,
  opts: { config?: WebPlaybackConfig } = {}
): Promise<void> {
  const yt = isYouTubeUrl(rawUrl)
  const videoId = extractVideoId(rawUrl) ?? undefined
  const muted = useBroadcastStore.getState().broadcastMuted
  const url = buildDisplayUrl(rawUrl, {
    // Cue paused — the operator presses Play from the live transport.
    autoplay: false,
    startTime: opts.config?.startTime,
    mute: muted,
  })
  useBroadcastStore
    .getState()
    .setLiveWeb(
      { url, isYouTube: yt, videoId, autoplay: false, ...opts.config },
      "manual"
    )
}

export function setMediaLayer(asset: MediaAsset): void {
  const layer: MediaLayerState = {
    filePath: asset.filePath,
    mediaType: asset.type as "image" | "video",
    name: asset.name,
    active: true,
  }
  useBroadcastStore.getState().setMediaLayer(layer)
}

export function clearMediaLayer(): void {
  useBroadcastStore.getState().setMediaLayer(null)
}

export const broadcastActions = {
  setLiveVerse: (verse: VerseRenderData | null) =>
    useBroadcastStore.getState().setLiveVerse(verse),
  setLive: (live: boolean) => useBroadcastStore.getState().setLive(live),
  getActiveTheme: () => {
    const s = useBroadcastStore.getState()
    const mainOutput = findOutput(s.outputs, "main")
    return s.themes.find((t) => t.id === mainOutput?.themeId) ?? s.themes[0]
  },
  presentSlide,
  presentMedia,
  presentWeb,
  presentWebUrl,
  setMediaLayer,
  clearMediaLayer,
}
