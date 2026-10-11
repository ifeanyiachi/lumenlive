import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import {
  FilmIcon,
  ImageIcon,
  CheckIcon,
  MusicIcon,
  FolderIcon,
  PlayIcon,
} from "lucide-react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { formatBytes, formatDuration, formatNumber } from "@/lib/i18n/format"
import { useDragSource } from "@/stores/drag-store"
import type { MediaAsset } from "@/types/media"
import { useTranslation } from "react-i18next"

export function MediaCard({
  asset,
  selected,
  checked,
  collectionCount = 0,
  dragAssets,
  onSelect,
  onToggleCheck,
}: {
  asset: MediaAsset
  selected: boolean
  checked: boolean
  collectionCount?: number
  /** Assets to drag when this card is dragged (accounts for multi-selection); omit to disable dragging. */
  dragAssets?: MediaAsset[]
  onSelect: (shiftKey: boolean) => void
  onToggleCheck: (shiftKey: boolean) => void
}) {
  const { t } = useTranslation("media")
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false)
  const dragSource = useDragSource()
  const dragHandlers = dragAssets
    ? dragSource(() => ({
        payload: { kind: "media" as const, assets: dragAssets },
        label:
          dragAssets.length > 1 ? `${dragAssets.length} media` : asset.name,
      }))
    : undefined

  const thumbSrc = useMemo(() => {
    if (asset.thumbnailDataUrl) return asset.thumbnailDataUrl
    if (asset.type === "image") {
      try {
        return safeFileSrc(asset.filePath)
      } catch {
        /* browser */
      }
    }
    return null
  }, [asset.thumbnailDataUrl, asset.type, asset.filePath])

  const videoSrc = useMemo(() => {
    if (asset.type !== "video") return null
    return safeFileSrc(asset.filePath)
  }, [asset.type, asset.filePath])

  return (
    <button
      type="button"
      onClick={(e) => onSelect(e.shiftKey)}
      {...dragHandlers}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-border/80 hover:bg-accent/50"
      )}
    >
      {/* Checkbox */}
      <div
        role="checkbox"
        aria-checked={checked}
        onClick={(e) => {
          e.stopPropagation()
          onToggleCheck(e.shiftKey)
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.stopPropagation()
            onToggleCheck(e.shiftKey)
          }
        }}
        tabIndex={0}
        className={cn(
          "absolute top-1.5 left-1.5 z-10 flex size-5 items-center justify-center rounded border transition-all",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-white/60 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
        )}
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={asset.name}
            className="size-full object-cover"
          />
        ) : videoSrc && !videoPreviewFailed ? (
          <>
            <video
              src={videoSrc}
              aria-label={t("preview", { name: asset.name })}
              className="size-full object-cover"
              muted
              playsInline
              preload="auto"
              onError={() => setVideoPreviewFailed(true)}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                // Avoid the often-black first frame without starting playback.
                if (Number.isFinite(video.duration) && video.duration > 0) {
                  video.currentTime = Math.min(1, video.duration * 0.1)
                }
              }}
            />
            <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
              <PlayIcon className="ml-px size-2.5 fill-current" />
            </span>
          </>
        ) : (
          <div className="flex size-full items-center justify-center">
            {asset.type === "video" ? (
              <FilmIcon className="size-8 text-muted-foreground/40" />
            ) : asset.type === "audio" ? (
              <MusicIcon className="size-8 text-muted-foreground/40" />
            ) : (
              <ImageIcon className="size-8 text-muted-foreground/40" />
            )}
          </div>
        )}
        {(asset.type === "video" || asset.type === "audio") &&
          asset.duration != null && (
            <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
              {formatDuration(asset.duration)}
            </span>
          )}
        {collectionCount > 0 && (
          <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
            <FolderIcon className="size-2.5" />
            {formatNumber(collectionCount)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium text-foreground">
          {asset.name}
        </span>
        <span className="text-[0.625rem] text-muted-foreground">
          {formatBytes(asset.fileSize)}
        </span>
      </div>
    </button>
  )
}
