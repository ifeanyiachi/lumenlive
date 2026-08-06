import type { LiveMedia } from "@/stores/broadcast-store"

/**
 * Letterbox backdrop for a DOM media monitor when the fit is "contain".
 * Mirrors the canvas renderer: "black" → nothing (container is already black),
 * "color" → a solid fill, "blur" → a blurred, cover-scaled copy of the media.
 */
export function MediaFitBackdrop({
  media,
  src,
}: {
  media: LiveMedia
  src: string
}) {
  if ((media.fit ?? "cover") !== "contain") return null
  const bg = media.containBackground ?? "black"
  if (bg === "black") return null

  if (bg === "color") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: media.containBackgroundColor || "#000000" }}
      />
    )
  }

  // blur: a cover-fitted copy behind the contained media.
  const style = {
    filter: "blur(24px) brightness(0.85)",
    transform: "scale(1.1)",
  } as const
  return media.mediaType === "video" ? (
    <video
      className="pointer-events-none absolute inset-0 size-full object-cover"
      style={style}
      src={src}
      muted
      autoPlay
      loop
      playsInline
    />
  ) : (
    <img
      className="pointer-events-none absolute inset-0 size-full object-cover"
      style={style}
      src={src}
      alt=""
    />
  )
}
