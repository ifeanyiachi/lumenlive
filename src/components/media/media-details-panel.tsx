import { useState, useMemo } from "react"
import {
  ImageIcon,
  FilmIcon,
  PlayIcon,
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
import { formatBytes, formatDuration } from "@/lib/i18n/format"
import { useTranslation } from "react-i18next"

export function MediaDetailsPanel() {
  const { t } = useTranslation("media")
  const assets = useMediaStore((s) => s.assets)
  const collections = useMediaStore((s) => s.collections)
  const selectedAssetId = useMediaStore((s) => s.selectedAssetId)
  const [tagInput, setTagInput] = useState("")
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)
  const [failedVideoId, setFailedVideoId] = useState<string | null>(null)

  const asset = assets.find((a) => a.id === selectedAssetId) ?? null

  const videoPreviewFailed = failedVideoId === asset?.id

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

  const videoSrc = useMemo(() => {
    if (!asset || asset.type !== "video") return null
    return safeFileSrc(asset.filePath)
  }, [asset])

  if (!asset) {
    return (
      <div
        data-slot="media-details"
        className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
      >
        <PanelHeader
          title={t("details")}
          icon={<InfoIcon className="size-3.5" />}
        />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("selectAsset")}</p>
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
      <PanelHeader
        title={t("details")}
        icon={<InfoIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Preview */}
          <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-muted">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt={asset.name}
                className="size-full object-contain"
              />
            ) : videoSrc && !videoPreviewFailed ? (
              <>
                <video
                  src={videoSrc}
                  aria-label={t("preview", { name: asset.name })}
                  className="size-full object-contain"
                  muted
                  playsInline
                  preload="auto"
                  onError={() => setFailedVideoId(asset.id)}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget
                    // Seek away from a possible black opening frame, without playing.
                    if (Number.isFinite(video.duration) && video.duration > 0) {
                      video.currentTime = Math.min(1, video.duration * 0.1)
                    }
                  }}
                />
                <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm">
                  <PlayIcon className="ml-px size-3 fill-current" />
                </span>
              </>
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
              <span>{t("type")}</span>
              <span className="capitalize">{asset.type}</span>
              <span>{t("size")}</span>
              <span>{formatBytes(asset.fileSize)}</span>
              <span>{t("dimensions")}</span>
              <span>
                {asset.width && asset.height
                  ? `${asset.width} x ${asset.height}`
                  : t("unknown")}
              </span>
              {(asset.type === "video" || asset.type === "audio") &&
                asset.duration != null && (
                  <>
                    <span>{t("duration")}</span>
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
              {t("tags")}
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
                placeholder={t("addTagPlaceholder")}
                aria-label={t("addTag")}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                className="h-7 flex-1 text-xs"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("addTag")}
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
              {t("collections")}
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
              {t("addToCollectionLower")}
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
            {t("removeFromLibrary")}
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
