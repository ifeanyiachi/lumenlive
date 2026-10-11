import { useMemo, useRef, useState } from "react"
import {
  ImageIcon,
  FilmIcon,
  LayoutGridIcon,
  TrashIcon,
  XIcon,
  MusicIcon,
  FolderIcon,
  FolderPlusIcon,
  ChevronDownIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PanelHeader } from "@/components/ui/panel-header"
import { EmptyState } from "@/components/ui/empty-state"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MediaCard } from "@/components/media/media-card"
import { MediaImportButton } from "@/components/media/media-import-button"
import { CollectionManagerDialog } from "@/components/media/collection-manager-dialog"
import { AddToCollectionDialog } from "@/components/media/add-to-collection-dialog"
import { useMediaStore } from "@/stores/media-store"
import { useOsFileDrop } from "@/hooks/use-os-file-drop"
import { cn } from "@/lib/utils"
import type { MediaType } from "@/types/media"
import { useTranslation } from "react-i18next"

export function MediaGrid() {
  const { t } = useTranslation("media")
  const allAssets = useMediaStore((s) => s.assets)
  const collections = useMediaStore((s) => s.collections)
  const filter = useMediaStore((s) => s.filter)
  const searchQuery = useMediaStore((s) => s.searchQuery)
  const selectedAssetId = useMediaStore((s) => s.selectedAssetId)
  const activeCollectionId = useMediaStore((s) => s.activeCollectionId)
  const checkedIds = useMediaStore((s) => s.checkedIds)
  const importProgress = useMediaStore((s) => s.importProgress)

  const [managerOpen, setManagerOpen] = useState(false)
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const selectionAnchorId = useRef<string | null>(selectedAssetId)
  const { isOver: fileDragOver, dropHandlers } = useOsFileDrop(dropZoneRef, {
    accept: ["image", "video", "audio"],
    onDrop: (assets) => {
      useMediaStore.getState().addAssets(assets)
      useMediaStore.getState().setSelectedAsset(assets[0].id)
    },
  })

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [collections, activeCollectionId]
  )

  const assets = useMemo(() => {
    let filtered = allAssets
    if (filter !== "all") {
      filtered = filtered.filter((a) => a.type === filter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (activeCollectionId) {
      const col = collections.find((c) => c.id === activeCollectionId)
      if (col) {
        const idSet = new Set(col.assetIds)
        filtered = filtered.filter((a) => idSet.has(a.id))
      }
    }
    return filtered
  }, [allAssets, filter, searchQuery, activeCollectionId, collections])

  const collectionCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of collections) {
      for (const id of c.assetIds) {
        map.set(id, (map.get(id) ?? 0) + 1)
      }
    }
    return map
  }, [collections])

  const checkedCount = checkedIds.size
  const hasChecked = checkedCount > 0
  const filters: {
    label: string
    value: MediaType | "all"
    icon: React.ReactNode
  }[] = [
    {
      label: t("filters.all"),
      value: "all",
      icon: <LayoutGridIcon className="size-3" />,
    },
    {
      label: t("filters.images"),
      value: "image",
      icon: <ImageIcon className="size-3" />,
    },
    {
      label: t("filters.videos"),
      value: "video",
      icon: <FilmIcon className="size-3" />,
    },
    {
      label: t("filters.audio"),
      value: "audio",
      icon: <MusicIcon className="size-3" />,
    },
  ]

  const emptyState = activeCollectionId
    ? {
        icon: <FolderIcon />,
        title: t("empty.collection"),
        description: t("empty.collectionHint"),
      }
    : searchQuery
      ? { icon: <ImageIcon />, title: t("empty.search") }
      : {
          icon: {
            all: <ImageIcon />,
            image: <ImageIcon />,
            video: <FilmIcon />,
            audio: <MusicIcon />,
          }[filter],
          title: {
            all: t("empty.all"),
            image: t("empty.images"),
            video: t("empty.videos"),
            audio: t("empty.audio"),
          }[filter],
          description: t("empty.importHint"),
        }

  const handleDeleteChecked = () => {
    useMediaStore.getState().removeAssets(checkedIds)
    selectionAnchorId.current = null
  }

  const handleSelectAll = () => {
    const next = new Set(checkedIds)
    for (const a of assets) next.add(a.id)
    useMediaStore.setState({ checkedIds: next })
  }

  const handleSelectAsset = (
    id: string,
    shiftKey: boolean,
    checkbox: boolean
  ) => {
    const store = useMediaStore.getState()
    if (shiftKey) {
      store.checkRange(
        assets.map((asset) => asset.id),
        selectionAnchorId.current,
        id
      )
      return
    }
    selectionAnchorId.current = id
    if (checkbox) store.toggleChecked(id)
    else store.setSelectedAsset(id)
  }

  return (
    <div
      ref={dropZoneRef}
      data-slot="media-grid"
      className={cn(
        "relative flex size-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors",
        fileDragOver && "ring-2 ring-emerald-500/50 ring-inset"
      )}
      {...dropHandlers}
    >
      {fileDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-emerald-500/10">
          <div className="flex flex-col items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <UploadIcon className="size-7" />
            <span className="text-sm font-medium">{t("dropFiles")}</span>
          </div>
        </div>
      )}
      <PanelHeader
        title={t("library")}
        icon={<ImageIcon className="size-3.5" />}
      >
        <MediaImportButton />
      </PanelHeader>

      {/* Import progress */}
      {importProgress && (
        <div className="border-b border-border bg-muted/50 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("importingProgress", {
                current: importProgress.current,
                total: importProgress.total,
              })}
            </span>
            <span>
              {Math.round(
                (importProgress.current / importProgress.total) * 100
              )}
              %
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-200"
              style={{
                width: `${(importProgress.current / importProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Selection toolbar */}
      {hasChecked ? (
        <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {t("selected", { count: checkedCount })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleSelectAll}
          >
            {t("selectAll")}
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setAddToCollectionOpen(true)}
          >
            <FolderPlusIcon className="size-3" />
            {t("addToCollection")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleDeleteChecked}
          >
            <TrashIcon className="size-3" />
            {t("delete")}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("clearSelection")}
            onClick={() => {
              useMediaStore.getState().clearChecked()
              selectionAnchorId.current = null
            }}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex gap-1">
            {filters.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 gap-1 px-2 text-xs",
                  filter === f.value && "font-medium"
                )}
                onClick={() => useMediaStore.getState().setFilter(f.value)}
              >
                {f.icon}
                {f.label}
              </Button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <FolderIcon className="size-3" />
                <span className="max-w-[100px] truncate">
                  {activeCollection
                    ? activeCollection.name
                    : t("allCollections")}
                </span>
                <ChevronDownIcon className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                className="text-xs"
                onClick={() =>
                  useMediaStore.getState().setActiveCollection(null)
                }
              >
                {t("allCollections")}
              </DropdownMenuItem>
              {collections.map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  className="text-xs"
                  onClick={() =>
                    useMediaStore.getState().setActiveCollection(col.id)
                  }
                >
                  <FolderIcon className="mr-1.5 size-3" />
                  <span className="flex-1 truncate">{col.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {col.assetIds.length}
                  </span>
                </DropdownMenuItem>
              ))}
              {collections.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className="text-xs"
                onClick={() => setManagerOpen(true)}
              >
                <SettingsIcon className="mr-1.5 size-3" />
                {t("manageCollections")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) =>
              useMediaStore.getState().setSearchQuery(e.target.value)
            }
            className="h-7 flex-1 text-xs"
          />
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <EmptyState
            size="lg"
            icon={emptyState.icon}
            title={emptyState.title}
            description={emptyState.description}
            live={Boolean(searchQuery)}
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-3">
            {assets.map((asset) => {
              const isChecked = checkedIds.has(asset.id)
              const dragAssets =
                isChecked && checkedIds.size > 1
                  ? allAssets.filter((a) => checkedIds.has(a.id))
                  : [asset]
              return (
                <MediaCard
                  key={asset.id}
                  asset={asset}
                  selected={selectedAssetId === asset.id}
                  checked={isChecked}
                  collectionCount={collectionCountMap.get(asset.id) ?? 0}
                  dragAssets={dragAssets}
                  onSelect={(shiftKey) =>
                    handleSelectAsset(asset.id, shiftKey, false)
                  }
                  onToggleCheck={(shiftKey) =>
                    handleSelectAsset(asset.id, shiftKey, true)
                  }
                />
              )
            })}
          </div>
        )}
      </ScrollArea>

      <CollectionManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
      />
      <AddToCollectionDialog
        open={addToCollectionOpen}
        onOpenChange={setAddToCollectionOpen}
        assetIds={[...checkedIds]}
      />
    </div>
  )
}
