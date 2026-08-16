import { useState, useMemo, useCallback, useRef } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useMediaStore } from "@/stores/media-store"
import { useDragSource } from "@/stores/drag-store"
import {
  pickThemeBackgroundImage,
  pickVideoFile,
  pickMediaFile,
} from "@/lib/theme-designer-files"
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  isTauri,
  filesToAssets,
} from "@/lib/media-import"
import {
  FilmIcon,
  ImageIcon,
  HardDriveIcon,
  SearchIcon,
  MusicIcon,
  UploadIcon,
} from "lucide-react"
import type { MediaAsset, MediaType } from "@/types/media"

interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaType?: MediaType
  onSelect: (asset: MediaAsset) => void
  onSelectMultiple?: (assets: MediaAsset[]) => void
  onSelectFromDevice: (result: string) => void
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  mediaType,
  onSelect,
  onSelectMultiple,
  onSelectFromDevice,
}: MediaPickerDialogProps) {
  const assets = useMediaStore((s) => s.assets)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [fileDragOver, setFileDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    let list = mediaType ? assets.filter((a) => a.type === mediaType) : assets
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((a) => a.name.toLowerCase().includes(q))
    }
    return list
  }, [assets, mediaType, search])

  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        if (shiftKey || onSelectMultiple) {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }
        return new Set([id])
      })
    },
    [onSelectMultiple]
  )

  const handlePickFromDevice = async () => {
    if (mediaType === "video") {
      const path = await pickVideoFile()
      if (path) {
        onSelectFromDevice(path)
        void useMediaStore.getState().importPaths([path])
        onOpenChange(false)
      }
    } else if (!mediaType) {
      const path = await pickMediaFile()
      if (path) {
        onSelectFromDevice(path)
        void useMediaStore.getState().importPaths([path])
        onOpenChange(false)
      }
    } else {
      const picked = await pickThemeBackgroundImage()
      if (picked) {
        onSelectFromDevice(picked.url)
        void useMediaStore.getState().importPaths([picked.path])
        onOpenChange(false)
      }
    }
  }

  const handleConfirm = () => {
    const selected = filtered.filter((a) => selectedIds.has(a.id))
    if (selected.length === 0) return

    if (selected.length > 1 && onSelectMultiple) {
      onSelectMultiple(selected)
    } else {
      onSelect(selected[0])
    }
    onOpenChange(false)
  }

  const commitFiles = useCallback(
    async (files: FileList | File[]) => {
      let newAssets = await filesToAssets(files)
      if (mediaType) newAssets = newAssets.filter((a) => a.type === mediaType)
      if (newAssets.length === 0) return

      useMediaStore.getState().addAssets(newAssets)
      if (newAssets.length > 1 && onSelectMultiple) {
        onSelectMultiple(newAssets)
      } else {
        onSelect(newAssets[0])
      }
      onOpenChange(false)
    },
    [mediaType, onSelect, onSelectMultiple, onOpenChange]
  )

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setFileDragOver(false)
      if (e.dataTransfer.files.length === 0) return
      void commitFiles(e.dataTransfer.files)
    },
    [commitFiles]
  )

  const handleWebFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files
      if (fileList && fileList.length > 0) void commitFiles(fileList)
      e.target.value = ""
    },
    [commitFiles]
  )

  const label = !mediaType
    ? "Media"
    : mediaType === "video"
      ? "Video"
      : mediaType === "audio"
        ? "Audio"
        : "Image"
  const selectedCount = selectedIds.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose {label}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${label.toLowerCase()}s in media library...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div
            className={cn(
              "relative rounded-md transition-colors",
              fileDragOver && "bg-emerald-500/5 ring-2 ring-emerald-500/50"
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
          >
            {fileDragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-emerald-500/10">
                <div className="flex flex-col items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <UploadIcon className="size-6" />
                  <span className="text-xs font-medium">
                    Drop {label.toLowerCase()} files here
                  </span>
                </div>
              </div>
            )}
            <ScrollArea className="h-[240px]">
              {filtered.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                  {mediaType === "video" ? (
                    <FilmIcon className="size-8 opacity-40" />
                  ) : mediaType === "audio" ? (
                    <MusicIcon className="size-8 opacity-40" />
                  ) : !mediaType ? (
                    <HardDriveIcon className="size-8 opacity-40" />
                  ) : (
                    <ImageIcon className="size-8 opacity-40" />
                  )}
                  <p className="text-xs">
                    No {label.toLowerCase()}s in media library
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground/60">
                    Drag files here or use &ldquo;From Device&rdquo;
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 p-0.5">
                  {filtered.map((asset) => (
                    <PickerCard
                      key={asset.id}
                      asset={asset}
                      selected={selectedIds.has(asset.id)}
                      onSelect={(e) => handleToggleSelect(asset.id, e.shiftKey)}
                      onDoubleClick={() => {
                        onSelect(asset)
                        onOpenChange(false)
                      }}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => void handlePickFromDevice()}
          >
            <HardDriveIcon className="mr-1.5 size-3" />
            From Device
          </Button>
          {!isTauri && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="mr-1.5 size-3" />
                Upload Files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={[
                  ...IMAGE_EXTENSIONS.map((e) => `.${e}`),
                  ...VIDEO_EXTENSIONS.map((e) => `.${e}`),
                  ...AUDIO_EXTENSIONS.map((e) => `.${e}`),
                ].join(",")}
                className="hidden"
                onChange={handleWebFileInput}
              />
            </>
          )}
          <Button
            size="sm"
            className="text-xs"
            disabled={selectedCount === 0}
            onClick={handleConfirm}
          >
            {selectedCount > 1 ? `Select ${selectedCount}` : "Select"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PickerCard({
  asset,
  selected,
  onSelect,
  onDoubleClick,
}: {
  asset: MediaAsset
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onDoubleClick: () => void
}) {
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
        return null
      }
    }
    return null
  }, [asset.thumbnailDataUrl, asset.type, asset.filePath])

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      {...dragHandlers}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border text-left transition-colors",
        selected
          ? "border-primary ring-1 ring-primary/40"
          : "border-border hover:border-border/80 hover:bg-accent/50"
      )}
    >
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
              <FilmIcon className="size-6 text-muted-foreground/40" />
            ) : asset.type === "audio" ? (
              <MusicIcon className="size-6 text-muted-foreground/40" />
            ) : (
              <ImageIcon className="size-6 text-muted-foreground/40" />
            )}
          </div>
        )}
      </div>
      <div className="px-1.5 py-1">
        <span className="line-clamp-1 text-[0.625rem] text-foreground">
          {asset.name}
        </span>
      </div>
    </button>
  )
}
