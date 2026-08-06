import { useMemo, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { FilmIcon, ImageIcon, MusicIcon, SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useMediaStore } from "@/stores/media-store"
import { useDragSource } from "@/stores/drag-store"
import { addAssetsToSchedule } from "@/lib/schedule-media"
import { cn } from "@/lib/utils"
import type { MediaAsset, MediaType } from "@/types/media"

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
        return convertFileSrc(asset.filePath)
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
    <div className="flex min-h-0 flex-1 flex-col">
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
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {assets.length === 0
              ? "No media yet — import files from the Media view."
              : "No media matches your search."}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-2">
            {filtered.map((asset) => (
              <DraggableMediaCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
