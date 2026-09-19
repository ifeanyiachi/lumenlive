import { useState, useMemo } from "react"
import { toast } from "sonner"
import { useBroadcastStore } from "@/stores"
import { StagePreviewCanvas } from "./stage-preview-canvas"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  PlusIcon,
  MoreHorizontalIcon,
  SearchIcon,
  PinIcon,
  PinOffIcon,
  CopyIcon,
  EditIcon,
  Trash2Icon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { StageLayout } from "@/types/stage-layout"
import { exportStageLayout, importThemeBundle } from "@/lib/theme-bundle/io"
import { ThemeBundleParseError } from "@/lib/theme-bundle"
import { useTranslation } from "react-i18next"

/** Export one stage layout to a `.lumtheme` bundle, packaging its media, with a toast. */
async function handleExportLayout(
  layout: StageLayout,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  try {
    const { saved, missingMedia } = await exportStageLayout(layout)
    if (!saved) return
    if (missingMedia > 0) {
      toast.warning(
        t("stageLibrary.exportMissingMedia", {
          name: layout.name,
          count: missingMedia,
        })
      )
    } else {
      toast.success(t("stageLibrary.exported", { name: layout.name }))
    }
  } catch {
    toast.error(t("stageLibrary.exportFailed"))
  }
}

function LayoutCard({
  layout,
  isEditing,
  onSelect,
}: {
  layout: StageLayout
  isEditing: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation("broadcast")
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
        isEditing && "ring-2 ring-primary"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
        <StagePreviewCanvas layout={layout} />
        {layout.pinned && (
          <div className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-background/80">
            <PinIcon className="size-3 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-0.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {layout.name}
        </p>
        {layout.builtin && (
          <Badge variant="outline" className="shrink-0 text-[0.5rem]">
            {t("builtIn")}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("stageLibrary.options")}
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                useBroadcastStore.getState().duplicateStageLayout(layout.id)
              }}
            >
              <CopyIcon className="mr-2 size-3.5" />
              {t("duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                void handleExportLayout(layout, t)
              }}
            >
              <DownloadIcon className="mr-2 size-3.5" />
              {t("export")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                useBroadcastStore.getState().togglePinStageLayout(layout.id)
              }}
            >
              {layout.pinned ? (
                <>
                  <PinOffIcon className="mr-2 size-3.5" />
                  {t("unpin")}
                </>
              ) : (
                <>
                  <PinIcon className="mr-2 size-3.5" />
                  {t("pin")}
                </>
              )}
            </DropdownMenuItem>
            {!layout.builtin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    const name = window.prompt(
                      t("stageLibrary.renamePrompt"),
                      layout.name
                    )
                    if (name?.trim()) {
                      useBroadcastStore
                        .getState()
                        .renameStageLayout(layout.id, name.trim())
                    }
                  }}
                >
                  <EditIcon className="mr-2 size-3.5" />
                  {t("rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    useBroadcastStore.getState().deleteStageLayout(layout.id)
                  }}
                >
                  <Trash2Icon className="mr-2 size-3.5" />
                  {t("delete")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function StageLayoutLibrary() {
  const { t } = useTranslation("broadcast")
  const layouts = useBroadcastStore((s) => s.stageLayouts)
  const editingId = useBroadcastStore((s) => s.editingStageLayoutId)
  const [search, setSearch] = useState("")
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null)

  const guardSwitch = (action: () => void) => {
    const state = useBroadcastStore.getState()
    if (state.draftStageLayout && state.stageUndoStack.length > 0) {
      setPendingSwitch(() => action)
    } else {
      action()
    }
  }

  const handleImport = async () => {
    try {
      const result = await importThemeBundle()
      if (!result) return
      toast.success(
        result.kind === "stage-layout"
          ? t("stageLibrary.imported", { name: result.name })
          : t("stageLibrary.importedTheme", { name: result.name })
      )
    } catch (err) {
      toast.error(
        err instanceof ThemeBundleParseError
          ? err.message
          : t("stageLibrary.importFailed")
      )
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return layouts
    const q = search.toLowerCase()
    return layouts.filter((l) => l.name.toLowerCase().includes(q))
  }, [layouts, search])

  const builtins = filtered.filter((l) => l.builtin)
  const customs = filtered.filter((l) => !l.builtin)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">
          {t("stageLibrary.title")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            title={t("stageLibrary.importTitle")}
            aria-label={t("stageLibrary.import")}
            onClick={handleImport}
          >
            <UploadIcon className="size-4" />
          </Button>
          <Button
            onClick={() =>
              guardSwitch(() =>
                useBroadcastStore.getState().createNewStageLayout()
              )
            }
          >
            <PlusIcon className="size-4" />
            {t("new")}
          </Button>
        </div>
      </div>

      <div className="px-3 pt-3 pb-4">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("stageLibrary.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-4">
          {builtins.length > 0 && (
            <>
              <p className="px-1.5 pt-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                {t("builtIn")}
              </p>
              {builtins.map((layout) => (
                <LayoutCard
                  key={layout.id}
                  layout={layout}
                  isEditing={layout.id === editingId}
                  onSelect={() =>
                    guardSwitch(() =>
                      useBroadcastStore
                        .getState()
                        .startEditingStageLayout(layout.id)
                    )
                  }
                />
              ))}
            </>
          )}
          {customs.length > 0 && (
            <>
              <p className="px-1.5 pt-3 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                {t("custom")}
              </p>
              {customs.map((layout) => (
                <LayoutCard
                  key={layout.id}
                  layout={layout}
                  isEditing={layout.id === editingId}
                  onSelect={() =>
                    guardSwitch(() =>
                      useBroadcastStore
                        .getState()
                        .startEditingStageLayout(layout.id)
                    )
                  }
                />
              ))}
            </>
          )}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {t("stageLibrary.none")}
            </p>
          )}
        </div>
      </ScrollArea>

      {pendingSwitch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            <div className="flex flex-col gap-2">
              <h3 className="font-heading leading-none font-medium">
                {t("stageLibrary.discardChanges")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("stageLibrary.discardDescription")}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingSwitch(null)}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  pendingSwitch()
                  setPendingSwitch(null)
                }}
              >
                {t("stageLibrary.discardSwitch")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
