const cache = new Map<string, HTMLImageElement>()

export function getSlideImageCache(): Map<string, HTMLImageElement> {
  return cache
}

export function preloadSlideImage(url: string): Promise<HTMLImageElement> {
  const existing = cache.get(url)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      cache.set(url, img)
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

export function ensureSlideImages(
  imageUrl: string | undefined,
  onReady: () => void
): void {
  if (!imageUrl) return
  if (cache.has(imageUrl)) return
  preloadSlideImage(imageUrl)
    .then(onReady)
    .catch(() => {})
}
