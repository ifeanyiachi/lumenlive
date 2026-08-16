import { useMemo, useRef, useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  FilmIcon,
  ImageIcon,
  LoaderIcon,
  MusicIcon,
  SearchIcon,
  UploadIcon,
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

const FILTERS: { value: MediaType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
]

function DraggableMediaCard({ asset }: { asset: MediaAsset }) {
  const dragSource = useDragSource()
  const dragHandlers = dragSource(() => ({
    payload: { kind: "media" as const, assets: [asset] },
    label: asset.name,
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

  return (
    <button
      type="button"
      {...dragHandlers}
      draggable={false}
      onDoubleClick={() => addAssetsToSchedule([asset], true)}
      title={`${asset.name} — drag to schedule or double-click to add`}
      className="group flex cursor-grab flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing"
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
  const assets = useMediaStore((s) => s.assets)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<MediaType | "all">("all")
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
            Drop to add to your media library
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
            placeholder="Search media..."
            className="h-7 pl-7 text-xs"
          />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-2 py-1 text-[0.625rem] font-medium transition-colors",
                filter === f.value
                  ? "bg-lime-500/15 text-lime-300"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={startImport}
          disabled={isImporting}
          title="Upload media from this device"
          className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-[0.625rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {isImporting ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <UploadIcon className="size-3" />
          )}
          {isImporting ? "Importing…" : "Upload"}
        </button>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No media yet — upload files to get started.
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
                {isImporting ? "Importing…" : "Upload media"}
              </button>
            </div>
          ) : (
            <p className="p-6 text-center text-xs text-muted-foreground">
              No media matches your search.
            </p>
          )
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-2">
            {filtered.map((asset) => (
              <DraggableMediaCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>

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
