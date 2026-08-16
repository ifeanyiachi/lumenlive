import { useState, useRef, useMemo, useCallback } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  ImageIcon,
  FilmIcon,
  MusicIcon,
  CheckIcon,
  UploadIcon,
  FolderOpenIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { useScheduleStore } from "@/stores/schedule-store"
import { useMediaStore } from "@/stores/media-store"
import { useDropZone } from "@/stores/drag-store"
import { getDefaultMediaFit } from "@/lib/media-fit"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { ScheduleItem, MediaScheduleItem } from "@/types/schedule"
import type { MediaAsset, MediaType as MediaAssetType } from "@/types/media"
import { MediaFitEditor } from "./media-fit-editor"
import { MediaTrimEditor } from "./media-trim-editor"

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi", "mkv"]
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"]
const MEDIA_ACCEPT = [
  ...IMAGE_EXTENSIONS.map((e) => `.${e}`),
  ...VIDEO_EXTENSIONS.map((e) => `.${e}`),
  ...AUDIO_EXTENSIONS.map((e) => `.${e}`),
].join(",")

function getMediaTypeFromName(name: string): MediaAssetType | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (IMAGE_EXTENSIONS.includes(ext)) return "image"
  if (VIDEO_EXTENSIONS.includes(ext)) return "video"
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio"
  return null
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function MediaProperties({
  item,
  scheduleId,
  stagingMode,
  onStagedExtras,
  onStagedMediaImports,
}: {
  item: MediaScheduleItem
  scheduleId: string
  stagingMode?: boolean
  onStagedExtras?: (extras: ScheduleItem[]) => void
  onStagedMediaImports?: (assetIds: string[]) => void
}) {
  const assets = useMediaStore((s) => s.assets)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [fileDragOver, setFileDragOver] = useState(false)
  const [recentAssetIds, setRecentAssetIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const currentAsset = useMemo(
    () => assets.find((a) => a.id === item.mediaAssetId) ?? null,
    [assets, item.mediaAssetId]
  )

  const recentAssets = useMemo(
    () =>
      recentAssetIds
        .map((id) => assets.find((a) => a.id === id))
        .filter(Boolean) as MediaAsset[],
    [assets, recentAssetIds]
  )

  const assignAsset = useCallback(
    (asset: MediaAsset) => {
      // Apply the saved default fit only on first assignment (don't clobber an
      // existing fit when swapping the asset of an already-configured item).
      const defaults =
        item.type === "media" && item.fit == null ? getDefaultMediaFit() : {}
      useScheduleStore.getState().updateItem(scheduleId, item.id, {
        mediaAssetId: asset.id,
        label: asset.name,
        cachedFilePath: asset.filePath,
        cachedMediaType: asset.type,
        ...defaults,
      })
    },
    [scheduleId, item.id, item.fit, item.type]
  )

  const assignMultipleAssets = useCallback(
    (assetList: MediaAsset[]) => {
      if (assetList.length === 0) return
      assignAsset(assetList[0])
      setRecentAssetIds(assetList.map((a) => a.id))

      if (assetList.length > 1) {
        const defaults = getDefaultMediaFit()
        const extras: MediaScheduleItem[] = []
        for (let i = 1; i < assetList.length; i++) {
          extras.push({
            id: crypto.randomUUID(),
            type: "media",
            label: assetList[i].name,
            order: 0,
            notes: "",
            mediaAssetId: assetList[i].id,
            cachedFilePath: assetList[i].filePath,
            cachedMediaType: assetList[i].type as "image" | "video",
            ...defaults,
          })
        }
        if (stagingMode && onStagedExtras) {
          onStagedExtras(extras)
        } else {
          const schedule = useScheduleStore.getState().getActiveSchedule()
          const itemIdx = schedule?.items.findIndex((i) => i.id === item.id)
          let insertAt =
            itemIdx !== undefined && itemIdx >= 0
              ? itemIdx + 1
              : (schedule?.items.length ?? 0)
          let added = 1 // the asset assigned to this item itself
          for (const extra of extras) {
            extra.order = insertAt
            if (
              useScheduleStore
                .getState()
                .insertItemAt(scheduleId, extra, insertAt)
            ) {
              added++
              insertAt++
            }
          }
          const skipped = assetList.length - added
          toast.success(
            `${added} media file${added > 1 ? "s" : ""} added` +
              (skipped > 0 ? ` · ${skipped} already there` : "")
          )
        }
      } else if (!stagingMode) {
        toast.success("Media file added")
      }
    },
    [item.id, scheduleId, assignAsset, stagingMode, onStagedExtras]
  )

  const importFiles = useCallback(
    (newAssets: MediaAsset[]) => {
      if (newAssets.length === 0) return
      useMediaStore.getState().addAssets(newAssets)
      if (stagingMode && onStagedMediaImports) {
        onStagedMediaImports(newAssets.map((a) => a.id))
      }
      assignMultipleAssets(newAssets)
    },
    [assignMultipleAssets, stagingMode, onStagedMediaImports]
  )

  const handleImport = async () => {
    if (isTauri) {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const { stat } = await import("@tauri-apps/plugin-fs")

      const paths = await open({
        multiple: true,
        filters: [
          {
            name: "Media",
            extensions: [
              ...IMAGE_EXTENSIONS,
              ...VIDEO_EXTENSIONS,
              ...AUDIO_EXTENSIONS,
            ],
          },
        ],
      })
      if (!paths || paths.length === 0) return

      const filePaths = Array.isArray(paths) ? paths : [paths]
      const newAssets: MediaAsset[] = []
      for (const filePath of filePaths) {
        const mediaType = getMediaTypeFromName(filePath)
        if (!mediaType) continue
        let fileSize = 0
        try {
          fileSize = (await stat(filePath)).size
        } catch {
          /* ignore stat failure */
        }
        newAssets.push({
          id: crypto.randomUUID(),
          name: filePath.replace(/\\/g, "/").split("/").pop() ?? filePath,
          type: mediaType,
          filePath,
          fileSize,
          tags: [],
          addedAt: Date.now(),
        })
      }
      importFiles(newAssets)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newAssets: MediaAsset[] = []
    for (const file of Array.from(files)) {
      const mediaType = getMediaTypeFromName(file.name)
      if (!mediaType) continue
      newAssets.push({
        id: crypto.randomUUID(),
        name: file.name,
        type: mediaType,
        filePath: file.name,
        fileSize: file.size,
        tags: [],
        addedAt: Date.now(),
      })
    }
    importFiles(newAssets)
    e.target.value = ""
  }

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setFileDragOver(false)

      // Internal gallery drags are handled by the pointer-based drag system.
      if (isTauri) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length === 0) return

      const newAssets: MediaAsset[] = []
      for (const file of files) {
        const mediaType = getMediaTypeFromName(file.name)
        if (!mediaType) continue
        newAssets.push({
          id: crypto.randomUUID(),
          name: file.name,
          type: mediaType,
          filePath: file.name,
          fileSize: file.size,
          tags: [],
          addedAt: Date.now(),
        })
      }
      importFiles(newAssets)
    },
    [importFiles]
  )

  const mediaDragOver = useDropZone(dropZoneRef, {
    accepts: ["media"],
    onDrop: (p) => {
      if (p.kind === "media") assignMultipleAssets(p.assets)
    },
  })

  const currentThumbSrc = useMemo(() => {
    if (!currentAsset) return null
    if (currentAsset.thumbnailDataUrl) return currentAsset.thumbnailDataUrl
    if (currentAsset.type === "image") {
      try {
        return safeFileSrc(currentAsset.filePath)
      } catch {
        return null
      }
    }
    return null
  }, [currentAsset])

  const handlePickerSelect = useCallback(
    (asset: MediaAsset) => {
      assignAsset(asset)
      setRecentAssetIds([asset.id])
    },
    [assignAsset]
  )

  const handlePickerSelectMultiple = useCallback(
    (selected: MediaAsset[]) => {
      assignMultipleAssets(selected)
    },
    [assignMultipleAssets]
  )

  // Once a media item has an asset assigned, the source pickers are redundant —
  // hide them (except while staging a brand-new item, where you're still choosing).
  const showSources = stagingMode || !currentAsset

  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2">
        <ImageIcon className="size-3.5 text-green-400" />
        <span className="text-xs font-medium text-green-400">Media</span>
      </div>

      {/* Current assignment preview */}
      {currentAsset && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
          <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
            {currentThumbSrc ? (
              <img
                src={currentThumbSrc}
                alt={currentAsset.name}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                {currentAsset.type === "video" ? (
                  <FilmIcon className="size-4 text-muted-foreground/40" />
                ) : currentAsset.type === "audio" ? (
                  <MusicIcon className="size-4 text-muted-foreground/40" />
                ) : (
                  <ImageIcon className="size-4 text-muted-foreground/40" />
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {currentAsset.name}
            </p>
            <p className="text-[0.625rem] text-muted-foreground capitalize">
              {currentAsset.type}
            </p>
          </div>
          <CheckIcon className="size-3.5 shrink-0 text-green-400" />
        </div>
      )}

      {/* Aspect / fit (image & video) */}
      {currentAsset &&
        (currentAsset.type === "image" || currentAsset.type === "video") && (
          <MediaFitEditor
            item={item}
            scheduleId={scheduleId}
            asset={currentAsset}
          />
        )}

      {/* Trim / loop / end-action prep player (video & audio) */}
      {currentAsset &&
        (currentAsset.type === "video" || currentAsset.type === "audio") && (
          <MediaTrimEditor
            item={item}
            scheduleId={scheduleId}
            asset={currentAsset}
          />
        )}

      {/* Recently imported preview grid */}
      {recentAssets.length > 1 && (
        <FieldGroup label={`${recentAssets.length} files added`}>
          <div className="flex flex-col gap-1.5">
            <div className="grid grid-cols-4 gap-1 rounded-md border border-border bg-muted/30 p-1.5">
              {recentAssets.map((asset) => (
                <RecentThumb key={asset.id} asset={asset} />
              ))}
            </div>
            <button
              type="button"
              className="self-end text-[0.625rem] text-muted-foreground hover:text-foreground"
              onClick={() => setRecentAssetIds([])}
            >
              Dismiss
            </button>
          </div>
        </FieldGroup>
      )}

      {/* Drop zone for files from computer */}
      {showSources && (
        <>
          <FieldGroup label="Upload from Computer">
            <div
              ref={dropZoneRef}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 transition-colors",
                mediaDragOver
                  ? "border-primary bg-primary/10"
                  : fileDragOver
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
              )}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = "copy"
                  setFileDragOver(true)
                }
              }}
              onDragLeave={() => setFileDragOver(false)}
              onDrop={handleFileDrop}
              onClick={handleImport}
            >
              <UploadIcon
                className={cn(
                  "size-6",
                  fileDragOver ? "text-emerald-500" : "text-muted-foreground/50"
                )}
              />
              <div className="text-center">
                <p
                  className={cn(
                    "text-xs font-medium",
                    fileDragOver
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground"
                  )}
                >
                  {fileDragOver ? "Drop files here" : "Drag & drop files here"}
                </p>
                <p className="text-[0.625rem] text-muted-foreground/60">
                  or click to browse
                </p>
              </div>
            </div>
          </FieldGroup>

          {/* Choose from library button */}
          <FieldGroup label="Media Library">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full gap-1.5 text-xs"
              onClick={() => setPickerOpen(true)}
            >
              <FolderOpenIcon className="size-3.5" />
              Choose from Library
            </Button>
          </FieldGroup>

          <MediaPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            mediaType={currentAsset?.type}
            onSelect={handlePickerSelect}
            onSelectMultiple={handlePickerSelectMultiple}
            onSelectFromDevice={(path: string) => {
              useScheduleStore.getState().updateItem(scheduleId, item.id, {
                cachedFilePath: path,
                label: path.replace(/\\/g, "/").split("/").pop() ?? "Media",
              })
            }}
          />

          {!isTauri && (
            <input
              ref={fileInputRef}
              type="file"
              accept={MEDIA_ACCEPT}
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          )}
        </>
      )}

      <FieldGroup label="Auto-advance (ms)">
        <Input
          type="number"
          className="h-7 text-xs"
          value={item.duration ?? ""}
          placeholder="Manual (no auto-advance)"
          min={0}
          step={1000}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : undefined
            useScheduleStore
              .getState()
              .updateItem(scheduleId, item.id, { duration: val })
          }}
        />
      </FieldGroup>
    </>
  )
}

function RecentThumb({ asset }: { asset: MediaAsset }) {
  const thumbSrc = useMemo(() => {
    if (asset.thumbnailDataUrl) return asset.thumbnailDataUrl
    if (asset.type === "image") {
      try {
        return safeFileSrc(asset.filePath)
      } catch {
        return null
      }
    }
    return null
  }, [asset.thumbnailDataUrl, asset.type, asset.filePath])

  return (
    <div className="flex flex-col overflow-hidden rounded border border-border">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt={asset.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            {asset.type === "video" ? (
              <FilmIcon className="size-3 text-muted-foreground/40" />
            ) : asset.type === "audio" ? (
              <MusicIcon className="size-3 text-muted-foreground/40" />
            ) : (
              <ImageIcon className="size-3 text-muted-foreground/40" />
            )}
          </div>
        )}
      </div>
      <div className="px-0.5 py-0.5">
        <span className="line-clamp-1 text-[0.5rem] text-foreground">
          {asset.name}
        </span>
      </div>
    </div>
  )
}
