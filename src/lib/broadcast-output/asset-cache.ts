/**
 * Asset preloading + caching for the output window (S2 Phase 3).
 *
 * The compositor draws from an image/video cache keyed by URL; this module fills
 * that cache. Everything is loaded **CORS-clean** (`crossOrigin = "anonymous"`)
 * because the NDI path reads the canvas back via `getImageData`, which throws on a
 * tainted canvas — so a tainted asset would silently drop every NDI frame while
 * still displaying on the projector. Tauri's asset protocol serves the CORS
 * headers this needs.
 *
 * Each loader fires an optional `onLoaded` callback once the asset is cached, so
 * the caller can trigger a redraw (the freshly-cached asset now paints).
 */

import type { BroadcastTheme } from "@/types/broadcast"

type ImageCache = Map<string, HTMLImageElement>

/**
 * Load `url` into `cache` if absent, invoking `onLoaded` once it is cached. No-op
 * on an empty url or a cache hit, so it is safe to call every render/update.
 */
export function preloadImage(
  cache: ImageCache,
  url: string | undefined,
  onLoaded?: (img: HTMLImageElement) => void,
  label = "image"
): void {
  if (!url || cache.has(url)) return
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.onload = () => {
    cache.set(url, img)
    onLoaded?.(img)
  }
  img.onerror = () => {
    console.warn(`[broadcast-output] failed to load ${label}`, { url })
  }
  img.src = url
}

/**
 * Load a looping, muted background video into `cache` under the `video:` key the
 * compositor reads. Autoplays once buffered and fires `onLoaded` so the redraw
 * loop can pick it up. No-op on a cache hit.
 */
export function preloadVideoBackground(
  cache: ImageCache,
  url: string,
  onLoaded?: () => void
): void {
  const cacheKey = `video:${url}`
  if (cache.has(cacheKey)) return
  const video = document.createElement("video")
  video.crossOrigin = "anonymous"
  video.src = url
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.addEventListener(
    "canplay",
    () => {
      // The cache is typed for images, but the compositor treats a `video:`-keyed
      // entry as a drawable source; the cast mirrors that shared convention.
      cache.set(cacheKey, video as unknown as HTMLImageElement)
      void video.play().catch(() => {})
      onLoaded?.()
    },
    { once: true }
  )
  video.load()
}

/**
 * Preload every drawable asset a theme references — its background (image or
 * video) and any decorative image elements — into `cache`, firing `onLoaded`
 * after each so the output redraws as assets arrive.
 */
export function preloadThemeAssets(
  theme: BroadcastTheme,
  cache: ImageCache,
  onLoaded?: () => void
): void {
  const bg = theme.background
  if (bg.type === "image" && bg.image?.url) {
    preloadImage(cache, bg.image.url, onLoaded, "background image")
  }
  if (bg.type === "video" && bg.video?.url) {
    preloadVideoBackground(cache, bg.video.url, onLoaded)
  }
  for (const el of theme.elements ?? []) {
    if (el.type === "image" && el.image?.url) {
      preloadImage(cache, el.image.url, onLoaded, "element image")
    }
  }
}
