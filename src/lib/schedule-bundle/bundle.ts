/**
 * Self-contained schedule bundles — the portable "save everything the service
 * needs into one file" format.
 *
 * The legacy export (`@/lib/schedule-io`) writes the schedule *document only*:
 * media/decks/songs/themes are referenced by id and resolve only on the machine
 * that already owns them, so a schedule opened on another PC shows blank media.
 * A bundle instead packages the referenced content itself. On disk it is a zip
 * (kept under the `.lumsched` extension; the Rust `write_bundle` /
 * `read_bundle` commands own the archive I/O) containing:
 *
 *  - `manifest.json` — the schedule plus the referenced presentations, songs and
 *    custom themes, with their **original** ids and URLs intact, and a media
 *    table listing each packaged file, and
 *  - `media/…` — the raw image/video/audio bytes.
 *
 * This module is the pure boundary: {@link buildScheduleBundle} produces the
 * manifest + the list of files to embed, and {@link parseScheduleBundle} turns a
 * read-back bundle into fresh, collision-free store records with every
 * cross-reference (media ids, deck ids, song/arrangement ids, theme ids, and the
 * baked `imageUrl`/`videoUrl`s) re-pointed at the imported copies. No filesystem,
 * no `@tauri-apps`, no stores — the forward path→URL conversion is injected.
 */

import type {
  MediaScheduleItem,
  ScheduleItem,
  ServiceSchedule,
  SlideScheduleItem,
  SongScheduleItem,
  ScriptureScheduleItem,
} from "@/types/schedule"
import type { Presentation, Slide } from "@/types/slide"
import type { Theme } from "@/types/theme"
import type { Song } from "@/types/song"
import type { SongSlideOptions } from "@/types/song"
import type { MediaAsset } from "@/types/media"
import type {
  BundleMediaEntry,
  BundleMediaFile,
  ExtractedMedia,
} from "@/types/bundle"
import { ScheduleParseError } from "@/lib/schedule-io"
import { resolveSongSlideOptions } from "@/lib/song/song-to-slides"

// Re-exported so existing consumers of `@/lib/schedule-bundle` keep resolving
// these shared bundle types from the barrel.
export type { BundleMediaEntry, BundleMediaFile, ExtractedMedia }
import {
  collectSurfaceRefs,
  rewriteSurface,
  type MediaSurface,
  type RewriteContext,
} from "./media-refs"

/** Marker distinguishing a bundle manifest from the legacy plain-JSON export. */
export const BUNDLE_FORMAT = "lumenlive.schedule.bundle"

/** Bundle manifest schema version. Bump on any manifest shape change. */
export const BUNDLE_VERSION = 3

/** The document written as `manifest.json` inside the bundle. */
export interface BundleManifest {
  format: typeof BUNDLE_FORMAT
  version: number
  exportedAt: number
  schedule: ServiceSchedule
  presentations: Presentation[]
  songs: Song[]
  /** Custom themes only — built-ins exist on every install and are never packaged. */
  themes: Theme[]
  media: BundleMediaEntry[]
}

// The Rust wire types (`BundleMediaFile`, `ExtractedMedia`) live in
// `@/types/bundle` and are re-exported from the top of this module.

/** Library snapshots the builder resolves references against. */
export interface BundleSources {
  mediaAssets: MediaAsset[]
  presentations: Presentation[]
  songs: Song[]
  /** Sender's projection defaults, needed to preserve inherited song settings. */
  songSlideDefaults: SongSlideOptions
  /** Main output's scripture theme at export time. */
  scriptureThemeId: string
  /**
   * Resolve a `themeId` (alias-aware) to its Theme, or `undefined`. Only themes
   * whose `builtin` is false are packaged. Injected so this module needn't reach
   * into the theme registry.
   */
  resolveTheme: (themeId: string) => Theme | undefined
}

/** Output of {@link buildScheduleBundle}. */
export interface BuiltBundle {
  manifest: BundleManifest
  mediaFiles: BundleMediaFile[]
  /** Referenced media whose source file couldn't be found (surfaced as a warning). */
  missingMedia: number
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble the manifest + media-file list for `schedule`. References are
 * collected transitively: slide items pull their decks, song items their songs
 * and (custom) themes, and every deck/theme/media item contributes the local
 * files it draws on. Ids and URLs are left untouched here — {@link
 * parseScheduleBundle} owns remapping on the way back in.
 */
export function buildScheduleBundle(
  schedule: ServiceSchedule,
  sources: BundleSources,
  exportedAt: number
): BuiltBundle {
  const portableSchedule: ServiceSchedule = {
    ...schedule,
    items: schedule.items.map((item) =>
      item.type === "scripture"
        ? { ...item, themeId: item.themeId ?? sources.scriptureThemeId }
        : item
    ),
  }
  const presIds = new Set<string>()
  const songIds = new Set<string>()
  const themeIds = new Set<string>()

  for (const item of portableSchedule.items) {
    if (item.type === "slide" && item.presentationId)
      presIds.add(item.presentationId)
    else if (item.type === "song" && item.songId) {
      songIds.add(item.songId)
      if (item.themeId) themeIds.add(item.themeId)
    } else if (item.type === "scripture" && item.themeId) {
      themeIds.add(item.themeId)
    }
  }

  const presentations = dedupeById(
    sources.presentations.filter((p) => presIds.has(p.id))
  )
  const songs = dedupeById(sources.songs.filter((s) => songIds.has(s.id))).map(
    (song) => ({
      ...song,
      slideOptions: resolveSongSlideOptions(
        sources.songSlideDefaults,
        song.slideOptions
      ),
    })
  )
  for (const song of songs) {
    const t = song.slideOptions?.themeId
    if (t) themeIds.add(t)
  }

  const themes: Theme[] = []
  const seenThemes = new Set<string>()
  for (const id of themeIds) {
    const theme = sources.resolveTheme(id)
    if (theme && !theme.builtin && !seenThemes.has(theme.id)) {
      seenThemes.add(theme.id)
      themes.push(theme)
    }
  }

  const { media, missingMedia } = collectMedia(
    portableSchedule,
    presentations,
    themes,
    sources
  )

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt,
    schedule: portableSchedule,
    presentations,
    songs,
    themes,
    media,
  }
  const mediaFiles = media.map((m) => ({
    srcPath: m.srcPath,
    zipName: m.zipName,
  }))
  return { manifest, mediaFiles, missingMedia }
}

function collectMedia(
  schedule: ServiceSchedule,
  presentations: Presentation[],
  themes: Theme[],
  sources: BundleSources
): { media: BundleMediaEntry[]; missingMedia: number } {
  const assetById = new Map(sources.mediaAssets.map((a) => [a.id, a]))
  const bySrcPath = new Map<string, BundleMediaEntry>()
  let missingMedia = 0

  // A local file, optionally carrying its library record. Adding the same path
  // twice merges — an asset record wins over a bare-URL reference.
  const add = (srcPath: string, asset?: MediaAsset) => {
    const existing = bySrcPath.get(srcPath)
    if (existing) {
      if (asset && !existing.asset) existing.asset = assetMeta(asset)
      return
    }
    const zipName = `${bySrcPath.size}-${sanitizeName(basename(srcPath))}`
    bySrcPath.set(srcPath, {
      zipName,
      srcPath,
      asset: asset ? assetMeta(asset) : undefined,
    })
  }

  // Schedule media items.
  for (const item of schedule.items) {
    if (item.type !== "media") continue
    const asset = item.mediaAssetId
      ? assetById.get(item.mediaAssetId)
      : undefined
    if (asset?.filePath) add(asset.filePath, asset)
    else if (item.cachedFilePath && isAbsolute(item.cachedFilePath)) {
      add(item.cachedFilePath)
    } else missingMedia++
  }

  // Deck slides and theme surfaces.
  const surfaces: MediaSurface[] = [
    ...presentations.flatMap((p) => p.slides),
    ...themes,
  ]
  for (const surface of surfaces) {
    const refs = collectSurfaceRefs(surface)
    for (const id of refs.assetIds) {
      const asset = assetById.get(id)
      if (asset?.filePath) add(asset.filePath, asset)
      else missingMedia++
    }
    for (const path of refs.localPaths) add(path)
  }

  return { media: [...bySrcPath.values()], missingMedia }
}

function assetMeta(a: MediaAsset): BundleMediaEntry["asset"] {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    width: a.width,
    height: a.height,
    duration: a.duration,
    fileSize: a.fileSize,
  }
}

// ── Parse ────────────────────────────────────────────────────────────────────

/** Store-ready records produced by {@link parseScheduleBundle}. */
export interface ParsedBundle {
  schedule: ServiceSchedule
  mediaAssets: MediaAsset[]
  presentations: Presentation[]
  songs: Song[]
  themes: Theme[]
}

export interface ParseBundleOptions {
  newId: () => string
  now: number
  /** Build a webview asset URL from a managed path (injected `safeFileSrc`). */
  toAssetUrl: (path: string) => string
}

/**
 * Turn a read-back bundle into fresh store records. Every entity is re-keyed and
 * every cross-reference — media ids, deck ids, song/section/arrangement ids,
 * theme ids, and baked `imageUrl`/`videoUrl`s — is re-pointed at the imported
 * copies, so importing never collides with existing library content and the
 * imported schedule presents its own media. Throws {@link ScheduleParseError}
 * on a manifest we can't read.
 */
export function parseScheduleBundle(
  rawManifest: unknown,
  extractedMedia: ExtractedMedia[],
  opts: ParseBundleOptions
): ParsedBundle {
  const manifest = validateManifest(rawManifest)
  const { newId, now, toAssetUrl } = opts

  const managedByZip = new Map(extractedMedia.map((m) => [m.zipName, m.path]))

  // Media: rebuild library records and the remap tables the rewriters need.
  const pathRemap = new Map<string, string>()
  const assetIdRemap = new Map<string, string>()
  const assetIdToManaged = new Map<string, string>()
  const mediaAssets: MediaAsset[] = []
  for (const entry of manifest.media) {
    const managed = managedByZip.get(entry.zipName)
    if (!managed) continue // file missing from the archive; skip gracefully
    pathRemap.set(entry.srcPath, managed)
    if (entry.asset) {
      const id = newId()
      assetIdRemap.set(entry.asset.id, id)
      assetIdToManaged.set(entry.asset.id, managed)
      mediaAssets.push({
        id,
        name: entry.asset.name,
        type: entry.asset.type,
        filePath: managed,
        width: entry.asset.width,
        height: entry.asset.height,
        duration: entry.asset.duration,
        fileSize: entry.asset.fileSize,
        tags: [],
        addedAt: now,
        managed: true,
      })
    }
  }
  const ctx: RewriteContext = { assetIdRemap, pathRemap, toAssetUrl }

  // Themes first — songs and schedule items reference theme ids.
  const themeIdRemap = new Map<string, string>()
  const themes = manifest.themes.map((theme) => {
    const id = newId()
    themeIdRemap.set(theme.id, id)
    return { ...rewriteSurface(theme, ctx), id, builtin: false }
  })

  // Presentations — re-point deck/slide/element ids and rewrite slide media.
  const presIdRemap = new Map<string, string>()
  const presentations = manifest.presentations.map((pres) => {
    const id = newId()
    presIdRemap.set(pres.id, id)
    const slides: Slide[] = pres.slides.map((slide) => {
      const rewritten = rewriteSurface(slide, ctx)
      const elementIdRemap = new Map<string, string>()
      const elements = rewritten.elements.map((element) => {
        const nextId = newId()
        elementIdRemap.set(element.id, nextId)
        return { ...element, id: nextId }
      })

      // A shape can refer to another element as its mask target. Preserve that
      // relationship after assigning fresh IDs to the imported elements.
      const remappedElements = elements.map((element) => {
        if (element.type !== "shape" || !element.maskTargetId) {
          return element
        }
        return {
          ...element,
          maskTargetId:
            elementIdRemap.get(element.maskTargetId) ?? element.maskTargetId,
        }
      })

      return { ...rewritten, id: newId(), elements: remappedElements }
    })
    return { ...pres, id, slides }
  })

  // Songs — deep re-key (song + sections + arrangements) and remap the theme id.
  const songIdRemap = new Map<string, string>()
  const arrangementIdRemap = new Map<string, string>()
  const songs = manifest.songs.map((song) =>
    rekeySong(song, newId, songIdRemap, arrangementIdRemap, themeIdRemap)
  )

  // Schedule — fresh ids, re-based order, and every reference remapped.
  const schedule = rewriteSchedule(manifest.schedule, newId, now, {
    assetIdRemap,
    assetIdToManaged,
    pathRemap,
    presIdRemap,
    songIdRemap,
    arrangementIdRemap,
    themeIdRemap,
  })

  return { schedule, mediaAssets, presentations, songs, themes }
}

interface ScheduleRemaps {
  assetIdRemap: Map<string, string>
  assetIdToManaged: Map<string, string>
  pathRemap: Map<string, string>
  presIdRemap: Map<string, string>
  songIdRemap: Map<string, string>
  arrangementIdRemap: Map<string, string>
  themeIdRemap: Map<string, string>
}

function rewriteSchedule(
  src: ServiceSchedule,
  newId: () => string,
  now: number,
  remaps: ScheduleRemaps
): ServiceSchedule {
  const items: ScheduleItem[] = []
  for (const item of src.items) {
    items.push({
      ...rewriteScheduleItem(item, remaps),
      id: newId(),
      order: items.length,
    })
  }
  return {
    id: newId(),
    name: src.name?.trim() ? src.name : "Imported Schedule",
    createdAt: now,
    updatedAt: now,
    items,
  }
}

function rewriteScheduleItem(
  item: ScheduleItem,
  remaps: ScheduleRemaps
): ScheduleItem {
  switch (item.type) {
    case "scripture": {
      const scripture = item as ScriptureScheduleItem
      return {
        ...scripture,
        themeId: scripture.themeId
          ? (remaps.themeIdRemap.get(scripture.themeId) ?? scripture.themeId)
          : scripture.themeId,
      }
    }
    case "media": {
      const mi = item as MediaScheduleItem
      const oldId = mi.mediaAssetId
      const managed = oldId ? remaps.assetIdToManaged.get(oldId) : undefined
      return {
        ...mi,
        mediaAssetId:
          (oldId && remaps.assetIdRemap.get(oldId)) || mi.mediaAssetId,
        cachedFilePath:
          managed ??
          (mi.cachedFilePath
            ? remaps.pathRemap.get(mi.cachedFilePath)
            : undefined) ??
          mi.cachedFilePath,
      }
    }
    case "slide": {
      const si = item as SlideScheduleItem
      return {
        ...si,
        presentationId:
          remaps.presIdRemap.get(si.presentationId) ?? si.presentationId,
      }
    }
    case "song": {
      const so = item as SongScheduleItem
      return {
        ...so,
        songId: remaps.songIdRemap.get(so.songId) ?? so.songId,
        arrangementId: so.arrangementId
          ? (remaps.arrangementIdRemap.get(so.arrangementId) ??
            so.arrangementId)
          : so.arrangementId,
        themeId: so.themeId
          ? (remaps.themeIdRemap.get(so.themeId) ?? so.themeId)
          : so.themeId,
      }
    }
    default:
      return item
  }
}

function rekeySong(
  song: Song,
  newId: () => string,
  songIdRemap: Map<string, string>,
  arrangementIdRemap: Map<string, string>,
  themeIdRemap: Map<string, string>
): Song {
  const sectionIdMap = new Map<string, string>()
  const sections = song.sections.map((s) => {
    const id = newId()
    sectionIdMap.set(s.id, id)
    return { ...s, id }
  })
  const arrangements = song.arrangements.map((a) => {
    const id = newId()
    arrangementIdRemap.set(a.id, id)
    return {
      ...a,
      id,
      sectionIds: a.sectionIds.map((sid) => sectionIdMap.get(sid) ?? sid),
    }
  })
  const id = newId()
  songIdRemap.set(song.id, id)

  const slideOptions =
    song.slideOptions?.themeId && themeIdRemap.has(song.slideOptions.themeId)
      ? {
          ...song.slideOptions,
          themeId: themeIdRemap.get(song.slideOptions.themeId),
        }
      : song.slideOptions

  return { ...song, id, sections, arrangements, slideOptions }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function validateManifest(raw: unknown): BundleManifest {
  if (!isRecord(raw) || raw.format !== BUNDLE_FORMAT) {
    throw new ScheduleParseError("This isn't a LumenLive schedule bundle.")
  }
  if (typeof raw.version !== "number" || raw.version > BUNDLE_VERSION) {
    throw new ScheduleParseError(
      "This bundle was made by a newer version of the app. Please update to import it."
    )
  }
  if (!isRecord(raw.schedule)) {
    throw new ScheduleParseError("This bundle is missing its schedule.")
  }
  // Tolerate older/partial manifests: default the collection arrays.
  return {
    format: BUNDLE_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : 0,
    schedule: raw.schedule as unknown as ServiceSchedule,
    presentations: Array.isArray(raw.presentations)
      ? (raw.presentations as Presentation[])
      : [],
    songs: Array.isArray(raw.songs) ? (raw.songs as Song[]) : [],
    themes: Array.isArray(raw.themes) ? (raw.themes as Theme[]) : [],
    media: Array.isArray(raw.media) ? (raw.media as BundleMediaEntry[]) : [],
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path
}

/** Keep a filename zip-safe: strip path separators and control/reserved chars. */
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "")
  return cleaned || "file"
}

function isAbsolute(path: string): boolean {
  // Drive-letter (C:\ / C:/), POSIX root, or UNC (\\server\share).
  return (
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("/") ||
    path.startsWith("\\\\")
  )
}
