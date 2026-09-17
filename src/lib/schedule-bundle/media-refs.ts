/**
 * Walk and rewrite the media references embedded in a slide or theme "surface"
 * (its `background` + `elements`). Used by the schedule-bundle builder to find
 * every local file a deck/theme depends on, and by the parser to re-point those
 * references at the files' new managed locations after import.
 *
 * A surface can reference local media three ways:
 *  - `background.mediaAssetId` — a media-library pointer (id).
 *  - `background.imageUrl` / `background.videoUrl` — an asset URL wrapping a
 *    local path (baked when a library/file background is chosen).
 *  - `SlideImageElement.imageUrl` / `SlideVideoElement.videoUrl` — same, on an
 *    element rather than the background.
 *
 * Pure data in, pure data out — no `@tauri-apps`, no stores. The forward path→URL
 * conversion is injected (`toAssetUrl`); the inverse is {@link extractLocalPath}.
 */

import type { SlideBackground, SlideElement } from "@/types/slide"
import { extractLocalPath } from "./asset-url"

/** The media-carrying part shared by a `Slide` and a `Theme`. */
export interface MediaSurface {
  background: SlideBackground
  elements: SlideElement[]
}

/** Everything a surface references that might need packaging. */
export interface SurfaceRefs {
  /** `mediaAssetId`s pointing into the media library. */
  assetIds: string[]
  /** Absolute local file paths recovered from `imageUrl`/`videoUrl` asset URLs. */
  localPaths: string[]
}

/**
 * Collect the media-library ids and local file paths a surface references.
 * Background `imageUrl`/`videoUrl` that merely mirror a `mediaAssetId` still
 * contribute their path, so a background chosen from the library packages its
 * bytes even if the asset lookup later misses.
 */
export function collectSurfaceRefs(surface: MediaSurface): SurfaceRefs {
  const assetIds: string[] = []
  const localPaths: string[] = []

  const bg = surface.background
  if (bg) {
    if (bg.mediaAssetId) assetIds.push(bg.mediaAssetId)
    pushPath(localPaths, bg.imageUrl)
    pushPath(localPaths, bg.videoUrl)
  }

  for (const el of surface.elements ?? []) {
    if (el.type === "image") pushPath(localPaths, el.imageUrl)
    else if (el.type === "video") pushPath(localPaths, el.videoUrl)
  }

  return { assetIds, localPaths }
}

function pushPath(into: string[], url: string | undefined) {
  const p = extractLocalPath(url)
  if (p) into.push(p)
}

/** Rewrite context for {@link rewriteSurface}. */
export interface RewriteContext {
  /** old `mediaAssetId` → new (post-import) `mediaAssetId`. */
  assetIdRemap: Map<string, string>
  /** original source path → new managed path on this machine. */
  pathRemap: Map<string, string>
  /** Build a webview asset URL from a managed path (injected `safeFileSrc`). */
  toAssetUrl: (path: string) => string
}

/**
 * Return a copy of `surface` with every media reference re-pointed at its
 * imported location. References that don't resolve (a `data:`/remote URL, or a
 * file that wasn't in the bundle) are left exactly as-is.
 */
export function rewriteSurface<T extends MediaSurface>(
  surface: T,
  ctx: RewriteContext
): T {
  const background = rewriteBackground(surface.background, ctx)
  const elements = (surface.elements ?? []).map((el) => rewriteElement(el, ctx))
  return { ...surface, background, elements }
}

function rewriteBackground(
  bg: SlideBackground,
  ctx: RewriteContext
): SlideBackground {
  if (!bg) return bg
  const next: SlideBackground = { ...bg }
  if (bg.mediaAssetId) {
    const remapped = ctx.assetIdRemap.get(bg.mediaAssetId)
    if (remapped) next.mediaAssetId = remapped
  }
  if (bg.imageUrl) next.imageUrl = rewriteUrl(bg.imageUrl, ctx)
  if (bg.videoUrl) next.videoUrl = rewriteUrl(bg.videoUrl, ctx)
  return next
}

function rewriteElement(el: SlideElement, ctx: RewriteContext): SlideElement {
  if (el.type === "image" && el.imageUrl) {
    return { ...el, imageUrl: rewriteUrl(el.imageUrl, ctx) }
  }
  if (el.type === "video" && el.videoUrl) {
    return { ...el, videoUrl: rewriteUrl(el.videoUrl, ctx) }
  }
  return el
}

/**
 * Re-point one `imageUrl`/`videoUrl` string. A local asset URL whose file was
 * packaged is rewritten to an asset URL for the file's managed path; everything
 * else (data URLs, remote URLs, un-bundled paths) is returned unchanged.
 */
export function rewriteUrl(url: string, ctx: RewriteContext): string {
  const path = extractLocalPath(url)
  if (!path) return url
  const managed = ctx.pathRemap.get(path)
  return managed ? ctx.toAssetUrl(managed) : url
}
