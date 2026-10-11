import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  FilmIcon,
  ImageIcon,
  ListPlusIcon,
  LoaderIcon,
  MusicIcon,
  PlayIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useMediaStore } from "@/stores/media-store"
import { useDragSource } from "@/stores/drag-store"
import { useMediaImport, MEDIA_ACCEPT } from "@/hooks/use-media-import"
import { useOsFileDrop } from "@/hooks/use-os-file-drop"
import { addAssetsToSchedule } from "@/lib/schedule-media"
import { cn } from "@/lib/utils"
import type { MediaAsset, MediaType } from "@/types/media"

const ALL_MEDIA_KINDS: MediaType[] = ["image", "video", "audio"]

const FILTERS: (MediaType | "all")[] = ["all", "image", "video", "audio"]

function DraggableMediaCard({
  asset,
  selected,
  dragAssets,
  onSelect,
}: {
  asset: MediaAsset
  selected: boolean
  /** Assets to drag when this card is dragged (accounts for multi-selection). */
  dragAssets: MediaAsset[]
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const { t } = useTranslation("panels")
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false)
  const dragSource = useDragSource()
  const dragHandlers = dragSource(() => ({
    payload: { kind: "media" as const, assets: dragAssets },
    label:
      dragAssets.length > 1
        ? t("search.mediaSelected", { count: dragAssets.length })
        : asset.name,
  }))

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

  // Videos without a stored thumbnail seek to an early frame for a preview
  // (matches media-card.tsx). safeFileSrc throws in the browser dev shell.
  const videoSrc = useMemo(() => {
    if (asset.type !== "video") return null
    try {
      return safeFileSrc(asset.filePath)
    } catch {
      return null
    }
  }, [asset.type, asset.filePath])

  return (
    <button
      type="button"
      {...dragHandlers}
      draggable={false}
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={() =>
        addAssetsToSchedule(dragAssets.length > 1 ? dragAssets : [asset], true)
      }
      title={t("search.mediaCard", { name: asset.name })}
      className={cn(
        "group relative flex cursor-grab flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors active:cursor-grabbing",
        selected
          ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbSrc ? (
          // draggable={false}: the browser's native image drag would fire
          // pointercancel and abort our pointer-based drag before it starts.
          <img
            src={thumbSrc}
            alt={asset.name}
            draggable={false}
            className="size-full object-cover"
          />
        ) : videoSrc && !videoPreviewFailed ? (
          <>
            <video
              src={videoSrc}
              aria-label={asset.name}
              className="size-full object-cover"
              draggable={false}
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
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
              <PlayIcon className="ml-px size-2 fill-current" />
            </span>
          </>
        ) : (
          <div className="flex size-full items-center justify-center">
            {asset.type === "video" ? (
              <FilmIcon className="size-7 text-muted-foreground/40" />
            ) : asset.type === "audio" ? (
              <MusicIcon className="size-7 text-muted-foreground/40" />
            ) : (
              <ImageIcon className="size-7 text-muted-foreground/40" />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-1.5">
        <span className="truncate text-[0.6875rem] font-medium text-foreground">
          {asset.name}
        </span>
      </div>
    </button>
  )
}

export function SearchMediaTab() {
  const { t } = useTranslation("panels")
  const assets = useMediaStore((s) => s.assets)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<MediaType | "all">("all")
  // Local multi-select: which library assets are selected in this panel. Kept
  // panel-local (not the media-store's `checkedIds`) so selecting here doesn't
  // affect the main media library toolbar.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionAnchorId = useRef<string | null>(null)
  const {
    fileInputRef,
    isImporting,
    startImport,
    handleFileChange,
    needsFileInput,
  } = useMediaImport()

  // Drop OS files (from Explorer/Finder) straight into the library. Assets are
  // deduped by path so re-dropping the same file is a no-op.
  const dropRef = useRef<HTMLDivElement>(null)
  const { isOver: fileDragOver, dropHandlers } = useOsFileDrop(dropRef, {
    accept: ALL_MEDIA_KINDS,
    onDrop: (assets) => useMediaStore.getState().mergeAssets(assets),
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return assets.filter((a) => {
      if (filter !== "all" && a.type !== filter) return false
      if (
        q &&
        !a.name.toLowerCase().includes(q) &&
        !a.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        return false
      }
      return true
    })
  }, [assets, filter, query])

  const selectMedia = useCallback(
    (id: string, event: React.MouseEvent<HTMLButtonElement>) => {
      const isToggle = event.ctrlKey || event.metaKey
      const isRange = event.shiftKey

      setSelectedIds((prev) => {
        if (isRange) {
          const anchorIndex = filtered.findIndex(
            (asset) => asset.id === selectionAnchorId.current
          )
          const targetIndex = filtered.findIndex((asset) => asset.id === id)

          if (anchorIndex >= 0 && targetIndex >= 0) {
            const range = filtered.slice(
              Math.min(anchorIndex, targetIndex),
              Math.max(anchorIndex, targetIndex) + 1
            )
            return isToggle
              ? new Set([...prev, ...range.map((asset) => asset.id)])
              : new Set(range.map((asset) => asset.id))
          }
        }

        selectionAnchorId.current = id
        if (isToggle) {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }
        return new Set([id])
      })
    },
    [filtered]
  )

  const clearSelection = useCallback(() => {
    selectionAnchorId.current = null
    setSelectedIds(new Set())
  }, [])

  // Selected assets in library order (also drops ids of any removed asset).
  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedIds.has(a.id)),
    [assets, selectedIds]
  )
  const selectedCount = selectedAssets.length

  return (
    <div
      ref={dropRef}
      {...dropHandlers}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col",
        fileDragOver && "ring-2 ring-primary/60 ring-inset"
      )}
    >
      {fileDragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10">
          <div className="flex items-center gap-2 rounded-md bg-background/90 px-3 py-2 text-xs font-medium shadow">
            <UploadIcon className="size-4 text-primary" />
            {t("search.dropToAdd")}
          </div>
        </div>
      )}
      {/* Search + filters */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.mediaPlaceholder")}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2 py-1 text-[0.625rem] font-medium transition-colors",
                filter === f
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`search.mediaFilters.${f}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={startImport}
          disabled={isImporting}
          title={t("search.uploadMediaTitle")}
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[0.625rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {isImporting ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <UploadIcon className="size-3" />
          )}
          {isImporting ? t("search.importing") : t("search.upload")}
        </button>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                {t("search.mediaEmpty")}
              </p>
              <button
                type="button"
                onClick={startImport}
                disabled={isImporting}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {isImporting ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <UploadIcon className="size-3.5" />
                )}
                {isImporting ? t("search.importing") : t("search.uploadMedia")}
              </button>
            </div>
          ) : (
            <p className="p-6 text-center text-xs text-muted-foreground">
              {t("search.mediaNoMatch")}
            </p>
          )
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-2">
            {filtered.map((asset) => {
              const isSelected = selectedIds.has(asset.id)
              // Dragging a selected card carries the whole selection; dragging
              // an unselected one carries just that asset.
              const dragAssets =
                isSelected && selectedCount > 1 ? selectedAssets : [asset]
              return (
                <DraggableMediaCard
                  key={asset.id}
                  asset={asset}
                  selected={isSelected}
                  dragAssets={dragAssets}
                  onSelect={(event) => selectMedia(asset.id, event)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Selection action bar: appears while one or more assets are selected. */}
      {selectedCount > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border bg-primary/5 px-3 py-2">
          <span className="flex-1 text-xs font-medium text-foreground">
            {t("search.mediaSelected", { count: selectedCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              addAssetsToSchedule(selectedAssets, true)
              clearSelection()
            }}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[0.6875rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ListPlusIcon className="size-3" />
            {t("search.addToSchedule")}
          </button>
          <button
            type="button"
            onClick={() => {
              useMediaStore
                .getState()
                .removeAssets(new Set(selectedAssets.map((asset) => asset.id)))
              clearSelection()
            }}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-[0.6875rem] font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <TrashIcon className="size-3" />
            {t("search.deleteMedia")}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            aria-label={t("search.clearSelection")}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {needsFileInput && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          onChange={handleFileChange}
          className="hidden"
        />
      )}
    </div>
  )
}
