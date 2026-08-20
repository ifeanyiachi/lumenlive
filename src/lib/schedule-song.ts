import { toast } from "sonner"
import { useScheduleStore } from "@/stores/schedule-store"
import { useSongStore } from "@/stores/song-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useThemesStore } from "@/stores/themes"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { addSlideToSchedule } from "@/lib/schedule-slide"
import type { Song, SongArrangement } from "@/types/song"
import type { SongScheduleItem } from "@/types/schedule"

export interface SongDropData {
  songId: string
  /** Optional arrangement; omitted → the song's default arrangement. */
  arrangementId?: string
}

/** Resolve the arrangement to use: the named one, else default, else first. */
function resolveArrangement(
  song: Song,
  arrangementId?: string
): SongArrangement | undefined {
  return (
    (arrangementId
      ? song.arrangements.find((a) => a.id === arrangementId)
      : undefined) ??
    song.arrangements.find((a) => a.isDefault) ??
    song.arrangements[0]
  )
}

/**
 * Add a song to the active schedule (creating one if none is active), inserting
 * it right after the currently-active item — the same placement slides use. The
 * item caches the title/CCLI number; its lyric slides are generated at go-live.
 */
export function addSongToSchedule(
  { songId, arrangementId }: SongDropData,
  insertIndex?: number
): void {
  const song = useSongStore.getState().songs.find((s) => s.id === songId)
  if (!song) return

  const store = useScheduleStore.getState()
  let scheduleId = store.activeScheduleId
  if (!scheduleId) {
    scheduleId = store.createSchedule()
    store.setActiveSchedule(scheduleId)
  }

  const arrangement = resolveArrangement(song, arrangementId)

  const current = useScheduleStore.getState()
  const schedule = current.getActiveSchedule()
  const insertAt =
    insertIndex ??
    (current.activeItemIndex !== null
      ? current.activeItemIndex + 1
      : (schedule?.items.length ?? 0))

  const item: SongScheduleItem = {
    id: crypto.randomUUID(),
    type: "song",
    label: song.title,
    order: insertAt,
    notes: "",
    songId: song.id,
    arrangementId: arrangement?.id,
    cachedTitle: song.title,
    cachedCcliNumber: song.ccliNumber,
  }

  const added = current.insertItemAt(scheduleId, item, insertAt)
  if (added) toast.success(`Added "${song.title}" to schedule`)
  else toast.info("Already in the schedule")
}

/**
 * Add a song to the schedule as **individual slide rows** rather than one
 * grouped song item. Generates the song's deck now (a frozen snapshot of the
 * current lyrics/options), stores it as a presentation, and inserts each slide
 * as its own `slide` item via `addSlideToSchedule`.
 *
 * Unlike {@link addSongToSchedule} — whose single item re-generates its deck at
 * go-live and so tracks later lyric edits — these rows are a point-in-time copy
 * and will not change if the song is edited afterwards.
 */
export function addSongAsIndividualSlides({
  songId,
  arrangementId,
}: SongDropData): void {
  const song = useSongStore.getState().songs.find((s) => s.id === songId)
  if (!song) return

  const arrangement = resolveArrangement(song, arrangementId)
  if (!arrangement) {
    toast.error("This song has no arrangement to expand")
    return
  }

  const options = resolveSongSlideOptions(
    useSettingsStore.getState().songSlideDefaults,
    song.slideOptions
  )
  const deck = generateSlidesFromSong(
    song,
    arrangement,
    options,
    undefined,
    undefined,
    useThemesStore.getState().customThemes
  )
  if (deck.slides.length === 0) {
    toast.info("This song has no lyrics to add as slides")
    return
  }

  // Ensure a schedule exists (addSlideToSchedule errors otherwise), matching
  // addSongToSchedule's auto-create behaviour.
  const store = useScheduleStore.getState()
  if (!store.activeScheduleId) {
    const id = store.createSchedule()
    store.setActiveSchedule(id)
  }

  // Materialise the generated deck as a presentation so each slide can be
  // referenced by a `slide` schedule item; addSlideToSchedule then inserts one
  // ungrouped row per slide.
  const presentationId = usePresentationStore
    .getState()
    .importParsedPresentation(deck)
  addSlideToSchedule({ presentationId, presentationName: song.title })
}
