/**
 * Store-facing orchestration for full-library backups — reads every content
 * store to build a `.lumbackup`, and merges a restored one back into them. Kept
 * out of {@link ./backup} (a pure, testable data boundary) and out of the
 * settings component (which just calls these two functions and shows a toast).
 * Mirrors `@/lib/schedule-bundle/io` and `@/lib/theme-bundle/io`.
 */

import { useThemesStore } from "@/stores/themes"
import { useMediaStore } from "@/stores/media-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { usePresentationStore } from "@/stores/presentation-store"
import { useSongStore } from "@/stores/song-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { useCountdownStore } from "@/stores/countdown-store"
import { useAlertStore } from "@/stores/alert-store"
import { useWebStore } from "@/stores/web-store"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { saveBundle, readBundle } from "@/services/bundle-gateway"
import {
  buildBackup,
  parseBackup,
  BackupParseError,
  BACKUP_EXTENSION,
  type BackupContent,
  type ParsedBackup,
} from "./backup"

/** Save dialog: always write the branded extension. */
const SAVE_FILTERS = [
  { name: "LumenLive backup", extensions: [BACKUP_EXTENSION] },
]

/**
 * Open dialog: accept the file whatever extension a transfer left it with. The
 * Rust reader detects the real format from the file's content, not its name.
 */
const OPEN_FILTERS = [
  { name: "LumenLive backup", extensions: [BACKUP_EXTENSION, "zip"] },
  { name: "All files", extensions: ["*"] },
]

/**
 * The content kinds a user can pick to include in an export, in display order.
 * Web bookmarks aren't individually selectable — they ride along only in a full
 * backup (see {@link gatherContent}).
 */
export const BACKUP_KINDS = [
  "themes",
  "stageLayouts",
  "presentations",
  "songs",
  "schedules",
  "mediaAssets",
  "countdownTimers",
  "alertTemplates",
] as const

/** One selectable content kind. */
export type BackupKind = (typeof BACKUP_KINDS)[number]

/** The set of content kinds an export should include. */
export type BackupSelection = ReadonlySet<BackupKind>

/** Every selectable kind — the default "export all content" selection. */
export function fullSelection(): Set<BackupKind> {
  return new Set(BACKUP_KINDS)
}

/**
 * Read the chosen content stores into one snapshot for the backup builder. Only
 * the selected kinds are gathered; unselected ones come back empty. Auxiliary
 * content (timers, alerts, bookmarks) travels only when every kind is selected,
 * i.e. a complete backup.
 */
function gatherContent(selection: BackupSelection): BackupContent {
  const has = (k: BackupKind) => selection.has(k)
  const full = BACKUP_KINDS.every((k) => selection.has(k))
  return {
    themes: has("themes") ? useThemesStore.getState().customThemes : [],
    stageLayouts: has("stageLayouts")
      ? useBroadcastStore.getState().stageLayouts.filter((l) => !l.builtin)
      : [],
    presentations: has("presentations")
      ? usePresentationStore.getState().presentations
      : [],
    songs: has("songs") ? useSongStore.getState().songs : [],
    schedules: has("schedules") ? useScheduleStore.getState().schedules : [],
    mediaAssets: has("mediaAssets") ? useMediaStore.getState().assets : [],
    countdownTimers: has("countdownTimers")
      ? useCountdownStore.getState().timers
      : [],
    alertTemplates: has("alertTemplates")
      ? useAlertStore.getState().templates
      : [],
    webBookmarks: full ? useWebStore.getState().bookmarks : [],
  }
}

/** Counts of each content kind, for the export/restore summary toast. */
export interface BackupCounts {
  themes: number
  stageLayouts: number
  presentations: number
  songs: number
  schedules: number
  mediaAssets: number
  countdownTimers: number
  alertTemplates: number
  webBookmarks: number
}

function countsOf(c: BackupContent): BackupCounts {
  return {
    themes: c.themes.length,
    stageLayouts: c.stageLayouts.length,
    presentations: c.presentations.length,
    songs: c.songs.length,
    schedules: c.schedules.length,
    mediaAssets: c.mediaAssets.length,
    countdownTimers: c.countdownTimers.length,
    alertTemplates: c.alertTemplates.length,
    webBookmarks: c.webBookmarks.length,
  }
}

/** Outcome of an export attempt. */
export interface ExportBackupResult {
  saved: boolean
  missingMedia: number
  counts: BackupCounts
}

/**
 * Package the chosen content kinds into a `.lumbackup` and prompt to save it.
 * Pass the set of kinds to include; defaults to a complete backup.
 */
export async function exportBackup(
  selection: BackupSelection = fullSelection()
): Promise<ExportBackupResult> {
  const content = gatherContent(selection)
  const { manifest, mediaFiles, missingMedia } = buildBackup(content, Date.now())
  const path = await saveBundle(
    `lumenlive-backup.${BACKUP_EXTENSION}`,
    JSON.stringify(manifest),
    mediaFiles,
    SAVE_FILTERS
  )
  return { saved: path != null, missingMedia, counts: countsOf(content) }
}

/** Outcome of a restore attempt (null = user cancelled or no Tauri). */
export interface RestoreBackupResult {
  counts: BackupCounts
}

/**
 * Prompt for a `.lumbackup` file, read it, register its media into the library,
 * and merge every content kind into its store by id (upsert — re-importing the
 * same backup overwrites the matching items rather than duplicating them).
 * Returns per-kind counts, or null if the user cancelled. Throws
 * {@link BackupParseError} on an unreadable file.
 */
export async function restoreBackup(): Promise<RestoreBackupResult | null> {
  const file = await readBundle("Restore backup", OPEN_FILTERS)
  if (!file) return null

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(file.manifestJson)
  } catch {
    throw new BackupParseError("This backup's manifest is corrupt.")
  }

  const parsed = parseBackup(rawManifest, file.media, {
    now: Date.now(),
    toAssetUrl: safeFileSrc,
  })

  applyRestore(parsed)
  return { counts: countsOf(parsed) }
}

/** Merge parsed content into every store by id. */
function applyRestore(parsed: ParsedBackup): void {
  // Media first, so surfaces' asset-id references resolve immediately.
  if (parsed.mediaAssets.length > 0) {
    useMediaStore.setState((s) => ({
      assets: mergeById(s.assets, parsed.mediaAssets),
    }))
  }

  // Themes and stage layouts have their own upsert-by-id store methods.
  for (const theme of parsed.themes) useThemesStore.getState().upsertTheme(theme)
  for (const layout of parsed.stageLayouts) {
    useBroadcastStore.getState().saveStageLayout(layout)
  }

  if (parsed.presentations.length > 0) {
    usePresentationStore.setState((s) => ({
      presentations: mergeById(s.presentations, parsed.presentations),
    }))
  }
  if (parsed.songs.length > 0) {
    useSongStore.setState((s) => ({
      songs: mergeById(s.songs, parsed.songs),
    }))
  }
  if (parsed.schedules.length > 0) {
    useScheduleStore.setState((s) => ({
      schedules: mergeById(s.schedules, parsed.schedules),
    }))
  }
  if (parsed.countdownTimers.length > 0) {
    useCountdownStore.setState((s) => ({
      timers: mergeById(s.timers, parsed.countdownTimers),
    }))
  }
  if (parsed.alertTemplates.length > 0) {
    useAlertStore.setState((s) => ({
      templates: mergeById(s.templates, parsed.alertTemplates),
    }))
  }
  if (parsed.webBookmarks.length > 0) {
    useWebStore.setState((s) => ({
      bookmarks: mergeById(s.bookmarks, parsed.webBookmarks),
    }))
  }
}

/**
 * Upsert `incoming` into `existing` by id: an incoming record replaces a
 * matching existing one in place; unmatched incoming records append. Preserves
 * existing order so the UI doesn't reshuffle on restore.
 */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const incomingById = new Map(incoming.map((x) => [x.id, x]))
  const merged = existing.map((x) => incomingById.get(x.id) ?? x)
  const existingIds = new Set(existing.map((x) => x.id))
  for (const x of incoming) if (!existingIds.has(x.id)) merged.push(x)
  return merged
}
