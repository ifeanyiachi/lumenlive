import type { Slide } from "./slide"

export type ScheduleItemType =
  "scripture" | "slide" | "media" | "header" | "web" | "song" | "lexicon"

interface ScheduleItemBase {
  id: string
  type: ScheduleItemType
  label: string
  notes?: string
  order: number
}

export interface ScriptureScheduleItem extends ScheduleItemBase {
  type: "scripture"
  translationId: number
  bookNumber: number
  chapter: number
  verseStart: number
  verseEnd: number
  cachedReference: string
  cachedText: string
}

export interface SlideScheduleItem extends ScheduleItemBase {
  type: "slide"
  presentationId: string
  slideIndex: number
  groupSlides?: boolean
}

export interface MediaMarker {
  id: string
  label: string
  time: number
}

export type MediaEndAction = "hold" | "stop" | "loop" | "next"

/**
 * How an image/video is fitted into the 16:9 output frame.
 * - `cover`   — fill the frame, cropping overflow (default; preserves aspect ratio)
 * - `contain` — fit entirely inside the frame, letterboxing with black bars (preserves aspect ratio)
 * - `fill`    — stretch to fill the frame, ignoring aspect ratio
 * - `zoom`    — like cover, scaled up further by `zoom`
 */
export type MediaFit = "cover" | "contain" | "fill" | "zoom"

/** How the letterbox area is filled when `fit` is "contain". */
export type ContainBackground = "black" | "blur" | "color"

export interface MediaScheduleItem extends ScheduleItemBase {
  type: "media"
  mediaAssetId: string
  cachedFilePath?: string
  cachedMediaType?: "image" | "video" | "audio"
  duration?: number
  /** Playback in-point in seconds (video/audio). */
  trimStart?: number
  /** Playback out-point in seconds (video/audio). */
  trimEnd?: number
  /** Loop playback between trim points. */
  loop?: boolean
  /** What to do when playback reaches the out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points for jump-to-marker. */
  markers?: MediaMarker[]
  /** How the image/video fills the output frame. Defaults to "cover". */
  fit?: MediaFit
  /** Extra scale multiplier applied when `fit` is "zoom" (>= 1). Defaults to 1. */
  zoom?: number
  /** Horizontal focal point (0 = left, 1 = right) used when cropping. Defaults to 0.5. */
  focalX?: number
  /** Vertical focal point (0 = top, 1 = bottom) used when cropping. Defaults to 0.5. */
  focalY?: number
  /** Letterbox fill when `fit` is "contain". Defaults to "black". */
  containBackground?: ContainBackground
  /** Solid color used when `containBackground` is "color". */
  containBackgroundColor?: string
}

export interface HeaderScheduleItem extends ScheduleItemBase {
  type: "header"
}

/**
 * A song in the running order. Like `ScriptureScheduleItem`, it caches display
 * fields (title, CCLI #) so a deleted/edited song still renders in the schedule,
 * but holds the live `songId`/`arrangementId` — the lyric slides are **generated
 * on demand at go-live** from the current song content (see the song store's
 * deck generation), so lyric edits are always reflected. `themeId` optionally
 * overrides the generated deck's theme for this item.
 */
export interface SongScheduleItem extends ScheduleItemBase {
  type: "song"
  songId: string
  arrangementId?: string // omitted → the song's default arrangement
  cachedTitle: string
  cachedCcliNumber?: string
  themeId?: string
}

/**
 * A word-study ("Lexical Summary") card in the running order. Unlike a
 * {@link SlideScheduleItem}, it does not reference a presentation from the
 * library — it carries its own pre-rendered {@link Slide} inline (the rasterized
 * lexicon card), so it presents through the normal slide pipeline and survives a
 * reload without depending on any external presentation. `reference`/`strong`
 * are kept for duplicate detection and labeling.
 */
export interface LexiconScheduleItem extends ScheduleItemBase {
  type: "lexicon"
  slide: Slide
  reference: string
  strong?: string
}

export interface WebScheduleItem extends ScheduleItemBase {
  type: "web"
  url: string
  autoplay: boolean
  /** Playback in-point in seconds (join-late / skip pre-service). */
  startTime?: number
  /** Playback out-point in seconds (VOD only; stops before the end-screen grid). */
  endTime?: number
  /** Whether this is a live stream (vs a recorded VOD). Enables Jump-to-Live. */
  isLive?: boolean
  /** What to do when a VOD reaches its out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points for jump-to-marker (absolute for VOD, DVR offsets for live). */
  markers?: MediaMarker[]
  isYouTube: boolean
  videoId?: string
}

export type ScheduleItem =
  | ScriptureScheduleItem
  | SlideScheduleItem
  | MediaScheduleItem
  | HeaderScheduleItem
  | WebScheduleItem
  | SongScheduleItem
  | LexiconScheduleItem

export interface ServiceSchedule {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  items: ScheduleItem[]
}

/**
 * Content identity of a schedule item, used for duplicate detection.
 *
 * Two items with the same key present the same thing and are treated as
 * duplicates. Returns `null` for items that have no meaningful identity yet
 * (unconfigured placeholders) or that may legitimately repeat (section
 * headers) — those are never flagged.
 */
export function scheduleItemKey(item: ScheduleItem): string | null {
  switch (item.type) {
    case "scripture":
      if (item.bookNumber <= 0) return null
      return `scripture:${item.translationId}:${item.bookNumber}:${item.chapter}:${item.verseStart}-${item.verseEnd}`
    case "slide":
      if (!item.presentationId) return null
      // A grouped slide item stands for the whole deck, so the slide index is
      // not part of its identity; an ungrouped one is a single slide.
      return item.groupSlides === false
        ? `slide:${item.presentationId}:${item.slideIndex}`
        : `slide:${item.presentationId}`
    case "media":
      return item.mediaAssetId ? `media:${item.mediaAssetId}` : null
    case "web": {
      const url = item.url.trim()
      if (!url) return null
      if (item.isYouTube && item.videoId) return `web:youtube:${item.videoId}`
      return `web:${url.replace(/\/+$/, "").toLowerCase()}`
    }
    case "song":
      return item.songId
        ? `song:${item.songId}:${item.arrangementId ?? "default"}`
        : null
    case "lexicon":
      // A word-study card is identified by its word (Strong's number) and the
      // verse it came from — the same word from the same verse is a duplicate.
      return `lexicon:${item.reference}:${item.strong ?? item.label}`
    case "header":
      return null
  }
}

export function createDefaultSchedule(name = "New Service"): ServiceSchedule {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
  }
}
