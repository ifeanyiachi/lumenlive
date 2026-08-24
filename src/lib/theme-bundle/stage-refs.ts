/**
 * Walk and rewrite the media references embedded in a {@link StageLayout}.
 *
 * A stage layout draws on the canvas vocabulary (`types/canvas.ts` /
 * `types/broadcast.ts`), not the slide vocabulary, so it can't share
 * `@/lib/schedule-bundle/media-refs` (which is `SlideBackground`/`SlideElement`
 * shaped). A layout references local media three ways, all as *asset URLs*
 * wrapping an absolute path (stage layouts carry no `mediaAssetId`):
 *  - `background.image.url` (when `background.type === "image"`),
 *  - `background.video.url` (when `background.type === "video"`), and
 *  - a `ThemeElement` of `type: "image"` → `element.image.url`.
 *
 * Pure data in, pure data out — no `@tauri-apps`, no stores. The forward
 * path→URL conversion is injected (`toAssetUrl`); the inverse is
 * {@link import("@/lib/schedule-bundle").extractLocalPath}.
 */

import type { StageLayout } from "@/types/stage-layout"
import type { Background } from "@/types/canvas"
import type { ThemeElement } from "@/types/broadcast"
import { extractLocalPath } from "@/lib/schedule-bundle"

/** The absolute local file paths a stage layout references. */
export interface StageLayoutRefs {
  localPaths: string[]
}

/** Collect the absolute local file paths a stage layout references. */
export function collectStageLayoutRefs(layout: StageLayout): StageLayoutRefs {
  const localPaths: string[] = []
  const push = (url: string | undefined | null) => {
    const p = extractLocalPath(url)
    if (p) localPaths.push(p)
  }

  push(layout.background?.image?.url)
  push(layout.background?.video?.url)
  for (const el of layout.elements ?? []) {
    if (el.type === "image") push(el.image?.url)
  }

  return { localPaths }
}

/** Rewrite context for {@link rewriteStageLayout}. */
export interface StageRewriteContext {
  /** original source path → new managed path on this machine. */
  pathRemap: Map<string, string>
  /** Build a webview asset URL from a managed path (injected `safeFileSrc`). */
  toAssetUrl: (path: string) => string
}

/**
 * Return a copy of `layout` with every media reference re-pointed at its
 * imported location. References that don't resolve (a `data:`/remote URL, or a
 * file that wasn't in the bundle) are left exactly as-is.
 */
export function rewriteStageLayout(
  layout: StageLayout,
  ctx: StageRewriteContext
): StageLayout {
  return {
    ...layout,
    background: rewriteBackground(layout.background, ctx),
    elements: (layout.elements ?? []).map((el) => rewriteElement(el, ctx)),
  }
}

function rewriteBackground(bg: Background, ctx: StageRewriteContext): Background {
  if (!bg) return bg
  const next: Background = { ...bg }
  if (bg.image) next.image = { ...bg.image, url: rewriteUrl(bg.image.url, ctx) }
  if (bg.video) next.video = { ...bg.video, url: rewriteUrl(bg.video.url, ctx) }
  return next
}

function rewriteElement(el: ThemeElement, ctx: StageRewriteContext): ThemeElement {
  if (el.type === "image" && el.image) {
    return { ...el, image: { ...el.image, url: rewriteUrl(el.image.url, ctx) } }
  }
  return el
}

/**
 * Re-point one asset URL. A local asset URL whose file was packaged is rewritten
 * to an asset URL for the file's managed path; everything else (data URLs,
 * remote URLs, un-bundled paths) is returned unchanged.
 */
function rewriteUrl(url: string, ctx: StageRewriteContext): string {
  const path = extractLocalPath(url)
  if (!path) return url
  const managed = ctx.pathRemap.get(path)
  return managed ? ctx.toAssetUrl(managed) : url
}
