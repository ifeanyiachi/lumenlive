import type { ScheduleItem, SongScheduleItem } from "@/types/schedule"
import type { Presentation } from "@/types/slide"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useThemesStore } from "@/stores/themes"
import { useSongStore } from "@/stores/song-store"
import { useSettingsStore } from "@/stores/settings-store"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { trackFeatureUsed } from "@/services/analytics-gateway"
import type { AddItemOptions } from "./types"

/**
 * Cross-slice helpers for the schedule store. Kept here (rather than in one
 * slice) because the navigation slice and the item-CRUD slice both reach for
 * them, and they close over other stores' state rather than the schedule
 * store's own `set`/`get`.
 */

/**
 * Generate the lyric deck for a song schedule item from the *current* song
 * content — resolving its arrangement (item override → default) and projection
 * options (global defaults ← per-song override ← per-item theme). Returns null if
 * the song or an arrangement no longer exists. Called at go-live and when staging
 * a song for preview, so lyric edits made beforehand are always reflected.
 */
export function deckForSongItem(item: SongScheduleItem): Presentation | null {
  const song = useSongStore.getState().songs.find((s) => s.id === item.songId)
  if (!song) return null
  const arrangement =
    (item.arrangementId
      ? song.arrangements.find((a) => a.id === item.arrangementId)
      : undefined) ??
    song.arrangements.find((a) => a.isDefault) ??
    song.arrangements[0]
  if (!arrangement) return null
  const base = resolveSongSlideOptions(
    useSettingsStore.getState().songSlideDefaults,
    song.slideOptions
  )
  const options = item.themeId ? { ...base, themeId: item.themeId } : base
  // A song is being turned into a lyric deck for live/preview — the song-slides
  // feature in real use (deduped once per session).
  trackFeatureUsed("song_slides")
  return generateSlidesFromSong(
    song,
    arrangement,
    options,
    undefined,
    undefined,
    useThemesStore.getState().customThemes
  )
}

/**
 * Push the live schedule item's presenter notes to the stage monitor's Notes
 * zone. (This once also computed a "next item" preview for a dedicated stage
 * zone; that zone was removed, so only the notes feed remains.)
 */
export function setStageNotesForItem(currentItem: ScheduleItem): void {
  useBroadcastStore.getState().setStageNotes(currentItem.notes ?? null)
}

export function shouldDedupe(opts?: AddItemOptions): boolean {
  return (
    opts?.dedupe ?? useSettingsStore.getState().preventDuplicateScheduleItems
  )
}
