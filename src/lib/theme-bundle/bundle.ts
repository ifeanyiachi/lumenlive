/**
 * Self-contained theme bundles — the portable "save one look, with its images,
 * into a single file" format. The small cousin of `@/lib/schedule-bundle`: same
 * `manifest.json` + `media/…` zip (written by the shared Rust `write_bundle` /
 * `read_bundle` commands, kept under the `.lumtheme` extension), but scoped to a
 * single design {@link Theme} *or* a single {@link StageLayout}.
 *
 * A theme/layout references media by baked asset URLs (and, for a design theme,
 * an optional `background.mediaAssetId`), which resolve only on the machine that
 * owns them — so a theme opened on another PC shows blank backgrounds. A bundle
 * packages the referenced bytes instead. {@link buildThemeBundle} produces the
 * manifest + the list of files to embed; {@link parseThemeBundle} turns a
 * read-back bundle into a fresh, collision-free store record with every media
 * reference re-pointed at the imported copies. No filesystem, no `@tauri-apps`,
 * no stores — the forward path→URL conversion is injected.
 */

import type { Theme } from "@/types/theme"
import type { StageLayout } from "@/types/stage-layout"
import type { MediaAsset } from "@/types/media"
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
import { BundleMediaCollector } from "@/lib/bundle-media/collector"
import { collectStageLayoutRefs, rewriteStageLayout } from "./stage-refs"

/** Marker distinguishing a theme bundle manifest from other bundle formats. */
export const THEME_BUNDLE_FORMAT = "lumenlive.theme.bundle"

/** Theme bundle manifest schema version. Bump on any manifest shape change. */
export const THEME_BUNDLE_VERSION = 1

/** The `.lumtheme` file extension (no dot). */
export const THEME_BUNDLE_EXTENSION = "lumtheme"

/** Thrown when a picked file isn't a readable theme bundle. */
export class ThemeBundleParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ThemeBundleParseError"
  }
}

/** The item a bundle carries — exactly one design theme or one stage layout. */
export type ThemeBundleItem =
  | { kind: "theme"; theme: Theme }
  | { kind: "stage-layout"; stageLayout: StageLayout }

/** The document written as `manifest.json` inside a theme bundle. */
export interface ThemeBundleManifest {
  format: typeof THEME_BUNDLE_FORMAT
  version: number
  exportedAt: number
  kind: ThemeBundleItem["kind"]
  /** Present when `kind === "theme"`. */
  theme?: Theme
  /** Present when `kind === "stage-layout"`. */
  stageLayout?: StageLayout
  media: BundleMediaEntry[]
}

/** Library snapshot the builder resolves design-theme asset ids against. */
export interface ThemeBundleSources {
  mediaAssets: MediaAsset[]
}

/** Output of {@link buildThemeBundle}. */
export interface BuiltThemeBundle {
  manifest: ThemeBundleManifest
  mediaFiles: BundleMediaFile[]
  /** Referenced media whose source file couldn't be found (surfaced as a warning). */
  missingMedia: number
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble the manifest + media-file list for a single theme or stage layout.
 * Ids and URLs are left untouched here — {@link parseThemeBundle} owns remapping
 * on the way back in.
 */
export function buildThemeBundle(
  item: ThemeBundleItem,
  sources: ThemeBundleSources,
  exportedAt: number
): BuiltThemeBundle {
  const collector = new BundleMediaCollector(sources.mediaAssets)

  if (item.kind === "theme") {
    const refs = collectSurfaceRefs(item.theme)
    for (const id of refs.assetIds) collector.addAssetId(id)
    for (const path of refs.localPaths) collector.addPath(path)
  } else {
    const refs = collectStageLayoutRefs(item.stageLayout)
    for (const path of refs.localPaths) collector.addPath(path)
  }

  const manifest: ThemeBundleManifest = {
    format: THEME_BUNDLE_FORMAT,
    version: THEME_BUNDLE_VERSION,
    exportedAt,
    kind: item.kind,
    theme: item.kind === "theme" ? item.theme : undefined,
    stageLayout: item.kind === "stage-layout" ? item.stageLayout : undefined,
    media: collector.entries(),
  }
  const mediaFiles = manifest.media.map((m) => ({
    srcPath: m.srcPath,
    zipName: m.zipName,
  }))
  return { manifest, mediaFiles, missingMedia: collector.missing }
}

// ── Parse ────────────────────────────────────────────────────────────────────

/** Store-ready record produced by {@link parseThemeBundle}. */
export interface ParsedThemeBundle {
  kind: ThemeBundleItem["kind"]
  /** Present when `kind === "theme"` — re-keyed, `builtin: false`. */
  theme?: Theme
  /** Present when `kind === "stage-layout"` — re-keyed, `builtin: false`. */
  stageLayout?: StageLayout
  /** New library records for any packaged design-theme assets. */
  mediaAssets: MediaAsset[]
}

export interface ParseThemeBundleOptions {
  newId: () => string
  now: number
  /** Build a webview asset URL from a managed path (injected `safeFileSrc`). */
  toAssetUrl: (path: string) => string
}

/**
 * Turn a read-back theme bundle into a fresh store record. The theme/layout is
 * re-keyed and every media reference (asset ids and baked `imageUrl`/`videoUrl`s)
 * is re-pointed at the imported copies, so importing never collides with
 * existing library content and the imported look presents its own media. Throws
 * {@link ThemeBundleParseError} on a manifest we can't read.
 */
export function parseThemeBundle(
  rawManifest: unknown,
  extractedMedia: ExtractedMedia[],
  opts: ParseThemeBundleOptions
): ParsedThemeBundle {
  const manifest = validateManifest(rawManifest)
  const { newId, now, toAssetUrl } = opts

  const managedByZip = new Map(extractedMedia.map((m) => [m.zipName, m.path]))

  // Rebuild library records and the remap tables the rewriters need.
  const pathRemap = new Map<string, string>()
  const assetIdRemap = new Map<string, string>()
  const mediaAssets: MediaAsset[] = []
  for (const entry of manifest.media) {
    const managed = managedByZip.get(entry.zipName)
    if (!managed) continue // file missing from the archive; skip gracefully
    pathRemap.set(entry.srcPath, managed)
    if (entry.asset) {
      const id = newId()
      assetIdRemap.set(entry.asset.id, id)
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

  if (manifest.kind === "stage-layout") {
    const src = manifest.stageLayout
    if (!src)
      throw new ThemeBundleParseError(
        "This bundle is missing its stage layout."
      )
    const stageLayout: StageLayout = {
      ...rewriteStageLayout(src, { pathRemap, toAssetUrl }),
      id: newId(),
      builtin: false,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
    return { kind: "stage-layout", stageLayout, mediaAssets }
  }

  const src = manifest.theme
  if (!src) throw new ThemeBundleParseError("This bundle is missing its theme.")
  const ctx: RewriteContext = { assetIdRemap, pathRemap, toAssetUrl }
  const theme: Theme = {
    ...rewriteSurface(src, ctx),
    id: newId(),
    builtin: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
  return { kind: "theme", theme, mediaAssets }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function validateManifest(raw: unknown): ThemeBundleManifest {
  if (!isRecord(raw) || raw.format !== THEME_BUNDLE_FORMAT) {
    throw new ThemeBundleParseError("This isn't a LumenLive theme bundle.")
  }
  if (typeof raw.version !== "number" || raw.version > THEME_BUNDLE_VERSION) {
    throw new ThemeBundleParseError(
      "This bundle was made by a newer version of the app. Please update to import it."
    )
  }
  const kind = raw.kind === "stage-layout" ? "stage-layout" : "theme"
  return {
    format: THEME_BUNDLE_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === "number" ? raw.exportedAt : 0,
    kind,
    theme: isRecord(raw.theme) ? (raw.theme as unknown as Theme) : undefined,
    stageLayout: isRecord(raw.stageLayout)
      ? (raw.stageLayout as unknown as StageLayout)
      : undefined,
    media: Array.isArray(raw.media) ? (raw.media as BundleMediaEntry[]) : [],
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}
