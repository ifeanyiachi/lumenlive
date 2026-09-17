/**
 * Full-library backup bundles (`.lumbackup`) — the "move everything to a new PC"
 * format. Where a schedule / theme bundle packages one document, a backup
 * packages the user's whole *content* library: custom themes, stage layouts,
 * presentations, songs, schedules, the media library (bytes and all), countdown
 * timers, alert templates and web bookmarks. It rides the same shared zip
 * byte-mover (`write_bundle` / `read_bundle`) as the other formats.
 *
 * Deliberately excluded: app settings (API keys are secrets and audio/monitor
 * config is machine-specific — the user re-enters those on the new PC), Bible
 * translation databases (large and re-downloadable), and STT models (bundled
 * with the app). See the export/import feature notes.
 *
 * ## Restore semantics — merge, ids preserved
 * Unlike the schedule/theme bundles (which re-key on import so a share never
 * collides), a backup is the user's *own* library, so entities keep their
 * original ids and are merged by id (upsert). That makes restore idempotent —
 * re-importing the same backup overwrites the matching items rather than
 * duplicating them — and keeps every cross-reference (a schedule's `themeId`, a
 * song's `slideOptions.themeId`, a slide's `mediaAssetId`) valid without any
 * remap. The one thing that *must* change is machine-specific media: baked
 * `imageUrl`/`videoUrl` paths and each `MediaAsset.filePath` are re-pointed at
 * the freshly-extracted managed copies.
 *
 * Pure data in, pure data out — no filesystem, no `@tauri-apps`, no stores. The
 * forward path→URL conversion is injected.
 */

import type { Theme } from "@/types/theme"
import type { StageLayout } from "@/types/stage-layout"
import type { Presentation, Slide } from "@/types/slide"
import type { Song } from "@/types/song"
import type { ServiceSchedule, MediaScheduleItem } from "@/types/schedule"
import type { MediaAsset } from "@/types/media"
import type { AlertTemplate, CountdownTimer } from "@/types/alert"
import type { WebBookmark } from "@/types/web"
import type {
  BundleMediaEntry,
  BundleMediaFile,
  ExtractedMedia,
} from "@/types/bundle"
import {
  collectSurfaceRefs,
  rewriteSurface,
  type RewriteContext,
} from "@/lib/schedule-bundle"
import { collectStageLayoutRefs, rewriteStageLayout } from "@/lib/theme-bundle"
import { BundleMediaCollector } from "@/lib/bundle-media/collector"

/** Marker distinguishing a backup manifest from the other bundle formats. */
export const BACKUP_FORMAT = "lumenlive.backup"

/** Backup manifest schema version. Bump on any manifest shape change. */
export const BACKUP_VERSION = 1

/** The `.lumbackup` file extension (no dot). */
export const BACKUP_EXTENSION = "lumbackup"

/** Thrown when a picked file isn't a readable backup. */
export class BackupParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackupParseError"
  }
}

/** The content library a backup carries. Every array holds custom user content. */
export interface BackupContent {
  themes: Theme[]
  stageLayouts: StageLayout[]
  presentations: Presentation[]
  songs: Song[]
  schedules: ServiceSchedule[]
  mediaAssets: MediaAsset[]
  countdownTimers: CountdownTimer[]
  alertTemplates: AlertTemplate[]
  webBookmarks: WebBookmark[]
}

/** The document written as `manifest.json` inside a backup. */
export interface BackupManifest extends BackupContent {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  media: BundleMediaEntry[]
}

/** Output of {@link buildBackup}. */
export interface BuiltBackup {
  manifest: BackupManifest
  mediaFiles: BundleMediaFile[]
  /** Referenced media whose source file couldn't be found (surfaced as a warning). */
  missingMedia: number
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble the manifest + media-file list for the whole content library. Every
 * media file is collected once: the entire media library (so reference-mode
 * assets travel too) plus any bare local paths baked into themes, stage layouts,
 * slides and schedule media items. Ids and URLs are left untouched here —
 * {@link parseBackup} owns the media re-pointing on the way back in.
 */
export function buildBackup(
  content: BackupContent,
  exportedAt: number
): BuiltBackup {
  const collector = new BundleMediaCollector(content.mediaAssets)

  // The whole media library — every managed/referenced file the user owns.
  for (const asset of content.mediaAssets) collector.addAssetId(asset.id)

  // Baked local paths on every media-carrying surface.
  for (const theme of content.themes) {
    for (const path of collectSurfaceRefs(theme).localPaths)
      collector.addPath(path)
  }
  for (const layout of content.stageLayouts) {
    for (const path of collectStageLayoutRefs(layout).localPaths) {
      collector.addPath(path)
    }
  }
  for (const pres of content.presentations) {
    for (const slide of pres.slides) {
      for (const path of collectSurfaceRefs(slide).localPaths) {
        collector.addPath(path)
      }
    }
  }
  // Schedule media items that cache an absolute file path directly.
  for (const schedule of content.schedules) {
    for (const item of schedule.items) {
      if (
        item.type === "media" &&
        item.cachedFilePath &&
        isAbsolute(item.cachedFilePath)
      ) {
        collector.addPath(item.cachedFilePath)
      }
    }
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    ...content,
    media: collector.entries(),
  }
  const mediaFiles = manifest.media.map((m) => ({
    srcPath: m.srcPath,
    zipName: m.zipName,
  }))
  return { manifest, mediaFiles, missingMedia: collector.missing }
}

// ── Parse ────────────────────────────────────────────────────────────────────

/** Store-ready content produced by {@link parseBackup}, ready to merge by id. */
export type ParsedBackup = BackupContent

export interface ParseBackupOptions {
  now: number
  /** Build a webview asset URL from a managed path (injected `safeFileSrc`). */
  toAssetUrl: (path: string) => string
}

/**
 * Turn a read-back backup into store-ready content. Ids are preserved (see the
 * module doc); only media is re-pointed — each `MediaAsset.filePath` and every
 * baked `imageUrl`/`videoUrl` is rewritten to the freshly-extracted managed
 * copy. Throws {@link BackupParseError} on a manifest we can't read.
 */
export function parseBackup(
  rawManifest: unknown,
  extractedMedia: ExtractedMedia[],
  opts: ParseBackupOptions
): ParsedBackup {
  const manifest = validateManifest(rawManifest)
  const { now, toAssetUrl } = opts

  const managedByZip = new Map(extractedMedia.map((m) => [m.zipName, m.path]))

  // srcPath → new managed path, for every file that made it into the archive.
  const pathRemap = new Map<string, string>()
  for (const entry of manifest.media) {
    const managed = managedByZip.get(entry.zipName)
    if (managed) pathRemap.set(entry.srcPath, managed)
  }

  // Ids are preserved, so no asset-id remap: an empty map leaves every
  // `mediaAssetId` untouched while `rewriteSurface` still re-points baked URLs.
  const surfaceCtx: RewriteContext = {
    assetIdRemap: new Map(),
    pathRemap,
    toAssetUrl,
  }

  // Media assets: keep id, re-point filePath at the extracted copy, mark managed.
  const mediaAssets = manifest.mediaAssets.map((a) => ({
    ...a,
    filePath: pathRemap.get(a.filePath) ?? a.filePath,
    managed: true,
    addedAt: a.addedAt || now,
  }))

  const themes = manifest.themes.map((t) => ({
    ...rewriteSurface(t, surfaceCtx),
    builtin: false,
  }))
  const stageLayouts = manifest.stageLayouts.map((l) => ({
    ...rewriteStageLayout(l, { pathRemap, toAssetUrl }),
    builtin: false,
  }))
  const presentations = manifest.presentations.map((p) => ({
    ...p,
    slides: p.slides.map((slide): Slide => rewriteSurface(slide, surfaceCtx)),
  }))
  const schedules = manifest.schedules.map((s) => ({
    ...s,
    items: s.items.map((item) =>
      item.type === "media" ? rewriteMediaItem(item, pathRemap) : item
    ),
  }))

  return {
    themes,
    stageLayouts,
    presentations,
    songs: manifest.songs,
    schedules,
    mediaAssets,
    countdownTimers: manifest.countdownTimers,
    alertTemplates: manifest.alertTemplates,
    webBookmarks: manifest.webBookmarks,
  }
}

function rewriteMediaItem(
  item: MediaScheduleItem,
  pathRemap: Map<string, string>
): MediaScheduleItem {
  if (!item.cachedFilePath) return item
  const managed = pathRemap.get(item.cachedFilePath)
  return managed ? { ...item, cachedFilePath: managed } : item
}

// ── Helpers ────────────────────────────────────────────────────────────────

function validateManifest(raw: unknown): BackupManifest {
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupParseError("This isn't a LumenLive backup file.")
  }
  if (typeof raw.version !== "number" || raw.version > BACKUP_VERSION) {
    throw new BackupParseError(
      "This backup was made by a newer version of the app. Please update to restore it."
    )
  }
  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : 0,
    themes: arr<Theme>(raw.themes),
    stageLayouts: arr<StageLayout>(raw.stageLayouts),
    presentations: arr<Presentation>(raw.presentations),
    songs: arr<Song>(raw.songs),
    schedules: arr<ServiceSchedule>(raw.schedules),
    mediaAssets: arr<MediaAsset>(raw.mediaAssets),
    countdownTimers: arr<CountdownTimer>(raw.countdownTimers),
    alertTemplates: arr<AlertTemplate>(raw.alertTemplates),
    webBookmarks: arr<WebBookmark>(raw.webBookmarks),
    media: arr<BundleMediaEntry>(raw.media),
  }
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function isAbsolute(path: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("/") ||
    path.startsWith("\\\\")
  )
}
