import {
  BookOpenIcon,
  LayoutIcon,
  ImageIcon,
  MinusIcon,
  GlobeIcon,
  MonitorPlayIcon,
  MusicIcon,
  LanguagesIcon,
} from "lucide-react"
import type {
  ScheduleItem,
  ScheduleItemType,
  ScriptureScheduleItem,
} from "@/types/schedule"
import type { Slide } from "@/types/slide"
import type { QueueItem } from "@/types/queue"

export const TYPE_ICONS: Record<ScheduleItemType, React.ReactNode> = {
  scripture: <BookOpenIcon className="size-3.5" />,
  slide: <LayoutIcon className="size-3.5" />,
  media: <ImageIcon className="size-3.5" />,
  header: <MinusIcon className="size-3.5" />,
  web: <GlobeIcon className="size-3.5" />,
  song: <MusicIcon className="size-3.5" />,
  lexicon: <LanguagesIcon className="size-3.5" />,
}

export const TYPE_LABELS: Record<ScheduleItemType, string> = {
  scripture: "Scripture",
  slide: "Slide",
  media: "Media",
  header: "Section",
  web: "Web Page",
  song: "Song",
  lexicon: "Word Study",
}

export function createEmptyItem(
  type: ScheduleItemType,
  order: number
): ScheduleItem {
  const base = { id: crypto.randomUUID(), order, notes: "" }
  switch (type) {
    case "scripture":
      return {
        ...base,
        type: "scripture",
        label: "Scripture Reading",
        translationId: 1,
        bookNumber: 43,
        chapter: 3,
        verseStart: 16,
        verseEnd: 16,
        cachedReference: "John 3:16 (KJV)",
        cachedText: "",
      }
    case "slide":
      return {
        ...base,
        type: "slide",
        label: "New Slide",
        presentationId: "",
        slideIndex: 0,
      }
    case "media":
      return { ...base, type: "media", label: "Media", mediaAssetId: "" }
    case "header":
      return { ...base, type: "header", label: "Section" }
    case "web":
      return {
        ...base,
        type: "web",
        label: "Web Page",
        url: "",
        autoplay: false,
        isYouTube: false,
      }
    case "song":
      return {
        ...base,
        type: "song",
        label: "Song",
        songId: "",
        cachedTitle: "",
      }
    case "lexicon":
      // Word-study cards are never created blank from the toolbar — they are
      // built from a chosen word (see buildLexiconScheduleItem). This branch
      // exists only to keep the switch exhaustive; the empty slide is a
      // placeholder that is immediately replaced when a real card is added.
      return {
        ...base,
        type: "lexicon",
        label: "Word Study",
        reference: "",
        slide: emptyPlaceholderSlide(),
      }
  }
}

function emptyPlaceholderSlide(): Slide {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: "Word Study",
    background: { type: "solid", color: "#f8fafc" },
    elements: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** A button in the schedule's "add item" toolbar. */
export interface QuickAction {
  id: string
  label: string
  icon: React.ReactNode
  build: (order: number) => ScheduleItem
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "scripture",
    label: TYPE_LABELS.scripture,
    icon: TYPE_ICONS.scripture,
    build: (order) => createEmptyItem("scripture", order),
  },
  {
    id: "slide",
    label: TYPE_LABELS.slide,
    icon: TYPE_ICONS.slide,
    build: (order) => createEmptyItem("slide", order),
  },
  {
    id: "media",
    label: TYPE_LABELS.media,
    icon: TYPE_ICONS.media,
    build: (order) => createEmptyItem("media", order),
  },
  {
    id: "youtube",
    label: "YouTube",
    icon: <MonitorPlayIcon className="size-3.5" />,
    build: (order) => ({
      ...(createEmptyItem(
        "web",
        order
      ) as import("@/types/schedule").WebScheduleItem),
      label: "YouTube",
      isYouTube: true,
    }),
  },
]

export function queueItemToScheduleItem(
  queueItem: QueueItem,
  order: number
): ScriptureScheduleItem {
  const v = queueItem.verse
  return {
    id: crypto.randomUUID(),
    type: "scripture",
    label: queueItem.reference,
    order,
    notes: "",
    translationId: v.translation_id,
    bookNumber: v.book_number,
    chapter: v.chapter,
    verseStart: v.verse,
    verseEnd: v.verse,
    cachedReference: queueItem.reference,
    cachedText: v.text,
  }
}
