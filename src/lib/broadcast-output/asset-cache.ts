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

import type {
  SlideBackground,
  SlideElement,
  SlideImageElement,
} from "@/types/slide"

type ImageCache = Map<string, HTMLImageElement>

/**
 * Longest a listener holds the previous backdrop/slide waiting on an image/video
 * asset before revealing anyway. The reveal gate keeps foreground and background
 * in sync, but a slow or broken asset must never freeze the output — after this it
 * reveals and the background draws its black placeholder (the pre-gate behavior
 * for a failed load). Sized to absorb a normal asset-protocol decode without a
 * visible hold. Shared by the slide, base-theme, and media-layer listeners.
 */
export const ASSET_REVEAL_FALLBACK_MS = 2000

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
 * Preload the **image** assets a slide-model source references — its
 * {@link SlideBackground} image and any decorative image elements — into the image
 * `cache`. The `Theme`-model analogue of {@link preloadThemeAssets} (themeredo.md,
 * flip RF3a): the base backdrop is now a `Theme`, whose background/elements are
 * slide-shaped (`imageUrl`).
 *
 * Video backgrounds are NOT handled here: `renderSlide` draws them from a separate
 * `videoCache` of live, playing `<video>` elements (not the image cache), so the
 * output runtime creates + plays those directly (see the base-theme listener),
 * exactly as it does for slide-mode video backgrounds.
 */
export function preloadSlideAssets(
  source: { background: SlideBackground; elements: SlideElement[] },
  cache: ImageCache,
  onLoaded?: () => void
): void {
  const bg = source.background
  if (bg.type === "image" && bg.imageUrl) {
    preloadImage(cache, bg.imageUrl, onLoaded, "slide background image")
  }
  for (const el of source.elements) {
    if (el.type === "image") {
      preloadImage(
        cache,
        (el as SlideImageElement).imageUrl,
        onLoaded,
        "slide element image"
      )
    }
  }
}

/**
 * Whether a slide's background can be painted from the caches **right now**.
 *
 * The compositor draws the verse/slide text synchronously every frame, but an
 * image/video background paints solid black until its asset is decoded (see
 * `slide-renderer/background.ts`). On production, assets stream over Tauri's
 * asset protocol, so that decode lags the text — text appears on black, then the
 * background pops in. Callers gate the first reveal on this predicate so text and
 * background surface as a single unit.
 *
 * - `image`   — ready once the bitmap is in `imageCache` (an empty url is a no-op
 *   background, so counts as ready).
 * - `video`   — ready once a `<video>` with `readyState >= 2` (≥ current-frame
 *   data) is in `videoCache`, keyed by raw `videoUrl` exactly as the compositor
 *   reads it (NOT the `video:`-prefixed key {@link preloadVideoBackground} uses).
 * - `solid` / `gradient` / `animated` / `transparent` — drawn synchronously from
 *   parameters, so always ready.
 */
export function slideBackgroundReady(
  slide: { background: SlideBackground },
  imageCache: ImageCache,
  videoCache: Map<string, HTMLVideoElement>
): boolean {
  const bg = slide.background
  switch (bg.type) {
    case "image":
      return !bg.imageUrl || imageCache.has(bg.imageUrl)
    case "video": {
      if (!bg.videoUrl) return true
      const video = videoCache.get(bg.videoUrl)
      return !!video && video.readyState >= 2
    }
    default:
      return true
  }
}
