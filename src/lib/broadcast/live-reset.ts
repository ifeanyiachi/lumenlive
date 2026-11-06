import type {
  VerseRenderData,
  LiveMedia,
  LiveWeb,
  MediaTransportState,
  WebTransportState,
} from "@/types/broadcast"
import type { Slide } from "@/types/slide"

/**
 * The full set of mutually-exclusive live-content fields on the broadcast store.
 * Only one kind (verse / slide / media / web) is ever live at a time.
 */
export interface ClearedLiveFields {
  liveVerse: VerseRenderData | null
  liveVersePages: VerseRenderData[] | null
  liveVersePageIndex: number
  liveSlide: Slide | null
  liveMedia: LiveMedia | null
  liveWeb: LiveWeb | null
  mediaTransport: MediaTransportState | null
  webTransport: WebTransportState | null
}

/**
 * The "reset all live content" patch shared by every `commit*Live` path.
 * Committing a new live item clears the others (they're mutually exclusive);
 * callers spread this and then override the single field they're presenting,
 * so the reset shape lives in exactly one place instead of being repeated per
 * commit helper.
 */
export function clearedLiveFields(): ClearedLiveFields {
  return {
    liveVerse: null,
    liveVersePages: null,
    liveVersePageIndex: 0,
    liveSlide: null,
    liveMedia: null,
    liveWeb: null,
    mediaTransport: null,
    webTransport: null,
  }
}
