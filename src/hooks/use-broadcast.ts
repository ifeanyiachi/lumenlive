import { useBroadcastStore } from "@/stores/broadcast-store"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { verseEditKey } from "@/types/verse-edit"
import type { VerseRenderData } from "@/types"
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
    autoplay: true,
    startTime: opts.config?.startTime,
    mute: muted,
  })
  useBroadcastStore
    .getState()
    .setLiveWeb({ url, isYouTube: yt, videoId, ...opts.config }, "manual")
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
    const mainOutput = s.outputs.find((o) => o.id === "main")
    return s.themes.find((t) => t.id === mainOutput?.themeId) ?? s.themes[0]
  },
  presentSlide,
  presentMedia,
  presentWeb,
  presentWebUrl,
  setMediaLayer,
  clearMediaLayer,
}
