/**
 * Store-facing orchestration for schedule bundles — the glue tier that reads the
 * media / presentation / song / theme stores to build a bundle, and writes those
 * stores back when importing one. Kept out of {@link ./bundle} (which stays a
 * pure, testable data boundary) and out of the component (which just calls these
 * two functions and shows the toast). Mirrors the store-glue style of
 * `@/lib/schedule-media` / `@/lib/schedule-song`.
 */

import type { ServiceSchedule } from "@/types/schedule"
import { useScheduleStore } from "@/stores/schedule-store"
import { useMediaStore } from "@/stores/media-store"
import { usePresentationStore } from "@/stores/presentation-store"
import { useSongStore } from "@/stores/song-store"
import { useThemesStore } from "@/stores/themes/store"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { parseScheduleFile, scheduleFileName } from "@/lib/schedule-io"
import {
  saveScheduleBundle,
  readScheduleFile,
} from "@/services/schedule-io-gateway"
import {
  buildScheduleBundle,
  parseScheduleBundle,
  type BundleSources,
} from "./bundle"
import { ScheduleParseError } from "@/lib/schedule-io"

/** Outcome of an export attempt. */
export interface ExportResult {
  /** True when a file was written (false = user cancelled or no Tauri). */
  saved: boolean
  /** Count of referenced media whose source file couldn't be found and packaged. */
  missingMedia: number
}

/**
 * Package `schedule` and everything it references (media bytes, decks, songs,
 * custom themes) into a self-contained bundle and prompt to save it.
 */
export async function exportScheduleBundle(
  schedule: ServiceSchedule
): Promise<ExportResult> {
  const sources: BundleSources = {
    mediaAssets: useMediaStore.getState().assets,
    presentations: usePresentationStore.getState().presentations,
    songs: useSongStore.getState().songs,
    resolveTheme: (id) => useThemesStore.getState().getThemeById(id),
  }
  const { manifest, mediaFiles, missingMedia } = buildScheduleBundle(
    schedule,
    sources,
    Date.now()
  )
  const path = await saveScheduleBundle(
    scheduleFileName(schedule.name),
    manifest,
    mediaFiles
  )
  return { saved: path != null, missingMedia }
}

/** Outcome of an import attempt (null = user cancelled or no Tauri). */
export interface ImportResult {
  scheduleName: string
  /** The active schedule id after import, so the caller can focus it. */
  scheduleId: string
}

/**
 * Prompt for a schedule file, read it (auto-detecting a bundle vs a legacy
 * plain-JSON export), register any packaged content into the stores with fresh
 * ids, and insert the schedule. Returns the imported schedule's name/id, or null
 * if the user cancelled. Throws {@link ScheduleParseError} on an unreadable file.
 */
export async function importScheduleBundle(): Promise<ImportResult | null> {
  const file = await readScheduleFile()
  if (!file) return null

  const scheduleStore = useScheduleStore.getState()

  // Legacy plain-JSON export: no packaged content, parse straight through.
  if (file.legacy) {
    const schedule = parseScheduleFile(
      file.manifestJson,
      () => crypto.randomUUID(),
      Date.now()
    )
    const id = scheduleStore.importSchedule(schedule)
    scheduleStore.setActiveSchedule(id)
    return { scheduleName: schedule.name, scheduleId: id }
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(file.manifestJson)
  } catch {
    throw new ScheduleParseError("This bundle's manifest is corrupt.")
  }

  const parsed = parseScheduleBundle(rawManifest, file.media, {
    newId: () => crypto.randomUUID(),
    now: Date.now(),
    toAssetUrl: safeFileSrc,
  })

  // Register packaged content before the schedule so its references resolve.
  if (parsed.mediaAssets.length > 0) {
    useMediaStore.getState().addAssets(parsed.mediaAssets)
  }
  for (const presentation of parsed.presentations) {
    usePresentationStore.getState().importParsedPresentation(presentation)
  }
  if (parsed.songs.length > 0) {
    useSongStore.getState().addSongs(parsed.songs)
  }
  for (const theme of parsed.themes) {
    useThemesStore.getState().upsertTheme(theme)
  }

  const id = scheduleStore.importSchedule(parsed.schedule)
  scheduleStore.setActiveSchedule(id)
  return { scheduleName: parsed.schedule.name, scheduleId: id }
}
