import { useState, useMemo } from "react"
import {
  ImageIcon,
  FilmIcon,
  MusicIcon,
  TrashIcon,
  TagIcon,
  FolderIcon,
  PlusIcon,
  XIcon,
  InfoIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { AddToCollectionDialog } from "@/components/media/add-to-collection-dialog"
import { useMediaStore } from "@/stores/media-store"
import { safeFileSrc } from "@/lib/media/safe-file-src"

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDimensions(w?: number, h?: number): string {
  if (w && h) return `${w} x ${h}`
  return "Unknown"
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function MediaDetailsPanel() {
  const assets = useMediaStore((s) => s.assets)
  const collections = useMediaStore((s) => s.collections)
  const selectedAssetId = useMediaStore((s) => s.selectedAssetId)
  const [tagInput, setTagInput] = useState("")
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)

  const asset = assets.find((a) => a.id === selectedAssetId) ?? null

  const assetCollections = useMemo(
    () =>
      asset ? collections.filter((c) => c.assetIds.includes(asset.id)) : [],
    [collections, asset]
  )

  const previewSrc = useMemo(() => {
    if (!asset) return null
    if (asset.thumbnailDataUrl) return asset.thumbnailDataUrl
    if (asset.type === "image") {
      try {
        return safeFileSrc(asset.filePath)
      } catch {
        /* not in Tauri */
      }
    }
    return null
  }, [asset])

  if (!asset) {
    return (
      <div
        data-slot="media-details"
        className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
      >
        <PanelHeader title="Details" icon={<InfoIcon className="size-3.5" />} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">Select a media asset</p>
        </div>
      </div>
    )
  }

  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (!tag || asset.tags.includes(tag)) return
    useMediaStore
      .getState()
      .updateAsset(asset.id, { tags: [...asset.tags, tag] })
    setTagInput("")
  }

  const handleRemoveTag = (tag: string) => {
    useMediaStore
      .getState()
      .updateAsset(asset.id, { tags: asset.tags.filter((t) => t !== tag) })
  }

  const handleRemoveFromCollection = (collectionId: string) => {
    useMediaStore.getState().removeAssetFromCollection(collectionId, asset.id)
  }

  const handleDelete = () => {
    useMediaStore.getState().removeAsset(asset.id)
  }

  return (
    <div
      data-slot="media-details"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader title="Details" icon={<InfoIcon className="size-3.5" />} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Preview */}
          <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={asset.name}
                className="size-full object-contain"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                {asset.type === "video" ? (
                  <FilmIcon className="size-10 text-muted-foreground/30" />
                ) : asset.type === "audio" ? (
                  <MusicIcon className="size-10 text-muted-foreground/30" />
                ) : (
                  <ImageIcon className="size-10 text-muted-foreground/30" />
                )}
              </div>
            )}
          </div>

          {/* File info */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              {asset.type === "video" ? (
                <FilmIcon className="size-3.5 text-muted-foreground" />
              ) : asset.type === "audio" ? (
                <MusicIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <ImageIcon className="size-3.5 text-muted-foreground" />
              )}
              <span className="truncate text-sm font-medium text-foreground">
                {asset.name}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Type</span>
              <span className="capitalize">{asset.type}</span>
              <span>Size</span>
              <span>{formatFileSize(asset.fileSize)}</span>
              <span>Dimensions</span>
              <span>{formatDimensions(asset.width, asset.height)}</span>
              {(asset.type === "video" || asset.type === "audio") &&
                asset.duration != null && (
                  <>
                    <span>Duration</span>
                    <span>{formatDuration(asset.duration)}</span>
                  </>
                )}
            </div>
          </div>

          <Separator />

          {/* Tags */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <TagIcon className="size-3" />
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {asset.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 text-[0.625rem]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-0.5 rounded-full hover:bg-muted"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                placeholder="Add tag..."
                aria-label="Add tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                className="h-7 flex-1 text-xs"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add tag"
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
              >
                <PlusIcon className="size-3" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Collections */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <FolderIcon className="size-3" />
              Collections
            </div>
            {assetCollections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assetCollections.map((col) => (
                  <Badge
                    key={col.id}
                    variant="outline"
                    className="gap-1 text-[0.625rem]"
                  >
                    {col.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveFromCollection(col.id)}
                      className="ml-0.5 rounded-full hover:bg-muted"
                    >
                      <XIcon className="size-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-1 text-xs text-muted-foreground"
              onClick={() => setAddToCollectionOpen(true)}
            >
              <PlusIcon className="size-3" />
              Add to collection
            </Button>
          </div>

          <Separator />

          {/* Actions */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleDelete}
          >
            <TrashIcon className="mr-1.5 size-3.5" />
            Remove from Library
          </Button>
        </div>
      </ScrollArea>

      <AddToCollectionDialog
        open={addToCollectionOpen}
        onOpenChange={setAddToCollectionOpen}
        assetIds={[asset.id]}
      />
    </div>
  )
}
