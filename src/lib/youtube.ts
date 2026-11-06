const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  /youtube\.com\/shorts\/([\w-]{11})/,
]

export function isYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((p) => p.test(url))
}

export function extractVideoId(url: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function buildEmbedUrl(
  videoId: string,
  opts: {
    autoplay?: boolean
    startTime?: number
    controls?: boolean
    enableApi?: boolean
    mute?: boolean
  } = {}
): string {
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    showinfo: "0",
    fs: "0",
    // Cue paused by default. Autoplay only when the caller explicitly opts in —
    // playback is operator-driven (press Play), never automatic.
    autoplay: opts.autoplay === true ? "1" : "0",
    controls: opts.controls ? "1" : "0",
  })
  if (opts.mute) {
    params.set("mute", "1")
  }
  if (opts.enableApi !== false) {
    params.set("enablejsapi", "1")
    params.set("origin", window.location.origin)
  }
  if (opts.startTime && opts.startTime > 0) {
    params.set("start", String(Math.floor(opts.startTime)))
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}

export function getThumbnailUrl(
  videoId: string,
  quality: "default" | "mq" | "hq" | "sd" | "maxres" = "mq"
): string {
  const suffix =
    quality === "mq"
      ? "mqdefault"
      : quality === "hq"
        ? "hqdefault"
        : quality === "sd"
          ? "sddefault"
          : quality === "maxres"
            ? "maxresdefault"
            : "default"
  return `https://img.youtube.com/vi/${videoId}/${suffix}.jpg`
}

export function buildDisplayUrl(
  url: string,
  opts: {
    autoplay?: boolean
    startTime?: number
    controls?: boolean
    mute?: boolean
  } = {}
): string {
  const videoId = extractVideoId(url)
  if (videoId) return buildEmbedUrl(videoId, opts)
  return url
}
