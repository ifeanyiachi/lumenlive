import { useState, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  PlusIcon,
  TrashIcon,
  CopyIcon,
  MusicIcon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PanelHeader } from "@/components/ui/panel-header"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useScheduleStore } from "@/stores/schedule-store"
import { useQueueStore, useSettingsStore } from "@/stores"
import { addSongToSchedule } from "@/lib/schedule-song"
import { useDropZone } from "@/stores/drag-store"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getTypeLabels } from "@/components/schedule/schedule-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { ItemPropertiesModal } from "@/components/schedule/item-properties-modal"
import { ScriptureItemEditModal } from "@/components/schedule/scripture-item-edit-modal"
import { requireFeature } from "@/components/entitlements/require-feature"
import { LexiconEditModal } from "@/components/verse-edit/lexicon-edit-modal"
import {
  buildLexiconSlideFromData,
  lexiconCardDataLabel,
} from "@/lib/lexicon-slide"
import { ScheduleSongsTab } from "@/components/schedule/schedule-songs-tab"
import { ScheduleAllTab } from "@/components/schedule/tabs/schedule-all-tab"
import { AIVersesTab } from "@/components/schedule/tabs/ai-verses-tab"
import { ScheduleParseError } from "@/lib/schedule-io"
import {
  exportScheduleBundle,
  importScheduleBundle,
} from "@/lib/schedule-bundle/io"
import { handleScheduleDrop, addVersesToQueue } from "@/lib/schedule-drop"
import type {
  ScheduleItem,
  ScriptureScheduleItem,
  LexiconScheduleItem,
} from "@/types/schedule"

export function SchedulePanel() {
  const { t } = useTranslation("schedule")
  const typeLabels = getTypeLabels()
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null)
  const [editingScripture, setEditingScripture] =
    useState<ScriptureScheduleItem | null>(null)
  const [editingLexicon, setEditingLexicon] =
    useState<LexiconScheduleItem | null>(null)
  const [stagedNewItem, setStagedNewItem] = useState<ScheduleItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState("all")
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const schedules = useScheduleStore((s) => s.schedules)
  const queueCount = useQueueStore((s) => s.items.length)

  // Dragging content over a tab trigger switches to that tab (revealing its
  // drop zone); releasing on the trigger drops into that tab directly.
  const allTabRef = useRef<HTMLButtonElement>(null)
  const aiTabRef = useRef<HTMLButtonElement>(null)
  const songsTabRef = useRef<HTMLButtonElement>(null)
  const allTabDragOver = useDropZone(allTabRef, {
    accepts: ["verses", "media", "slide"],
    onEnter: () => setActiveTab("all"),
    onDrop: handleScheduleDrop,
  })
  const aiTabDragOver = useDropZone(aiTabRef, {
    accepts: ["verses"],
    onEnter: () => setActiveTab("ai-verses"),
    onDrop: (p) => {
      if (p.kind === "verses") addVersesToQueue(p)
    },
  })
  const songsTabDragOver = useDropZone(songsTabRef, {
    accepts: ["song"],
    onEnter: () => setActiveTab("songs"),
    onDrop: (p) => {
      if (p.kind === "song") addSongToSchedule({ songId: p.songId })
    },
  })

  const activeSchedule = schedules.find((sc) => sc.id === activeScheduleId)

  const handleCreateSchedule = () => {
    const id = useScheduleStore.getState().createSchedule()
    useScheduleStore.getState().setActiveSchedule(id)
    toast.success(t("toast.created"))
  }

  const handleConfirmDelete = () => {
    if (activeScheduleId) {
      useScheduleStore.getState().deleteSchedule(activeScheduleId)
      toast(t("toast.deleted"))
    }
    setConfirmDelete(false)
  }

  const handleExportSchedule = async () => {
    if (!activeSchedule) return
    try {
      const { saved, missingMedia } = await exportScheduleBundle(activeSchedule)
      if (!saved) return
      if (missingMedia > 0) {
        toast.warning(
          `Exported "${activeSchedule.name}" · ${missingMedia} media file${
            missingMedia > 1 ? "s were" : " was"
          } missing and couldn't be packaged`
        )
      } else {
        toast.success(t("toast.exported", { name: activeSchedule.name }))
      }
    } catch {
      toast.error(t("toast.exportFailed"))
    }
  }

  const handleImportSchedule = async () => {
    try {
      const result = await importScheduleBundle()
      if (result)
        toast.success(t("toast.imported", { name: result.scheduleName }))
    } catch (err) {
      toast.error(
        err instanceof ScheduleParseError
          ? err.message
          : t("toast.importFailed")
      )
    }
  }

  return (
    <div
      data-slot="schedule-panel"
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader title={t("panel.title")}>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCreateSchedule}
            title={t("panel.new")}
          >
            <PlusIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleImportSchedule}
            title={t("panel.import")}
          >
            <DownloadIcon className="size-3.5" />
          </Button>
          {activeScheduleId && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleExportSchedule}
                title={t("panel.export")}
              >
                <UploadIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  useScheduleStore
                    .getState()
                    .duplicateSchedule(activeScheduleId)
                  toast.success(t("toast.duplicated"))
                }}
                title={t("panel.duplicate")}
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmDelete(true)}
                title={t("panel.delete")}
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </PanelHeader>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="line" className="shrink-0 px-2">
          <TabsTrigger
            ref={allTabRef}
            value="all"
            className={cn(
              allTabDragOver && "bg-primary/15 ring-1 ring-primary/50"
            )}
          >
            {t("panel.all")}
          </TabsTrigger>
          <TabsTrigger
            ref={aiTabRef}
            value="ai-verses"
            data-tour="ai-verses"
            className={cn(
              "gap-1.5",
              aiTabDragOver && "bg-primary/15 ring-1 ring-primary/50"
            )}
          >
            {t("panel.aiVerses")}
            {queueCount > 0 && (
              <Badge
                variant="outline"
                className="ml-1 h-4 min-w-4 px-1 text-[0.5rem]"
              >
                {queueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            ref={songsTabRef}
            value="songs"
            className={cn(
              "gap-1.5",
              songsTabDragOver && "bg-primary/15 ring-1 ring-primary/50"
            )}
          >
            <MusicIcon className="size-3.5" />
            {t("panel.songs")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex min-h-0 flex-1 flex-col">
          <ScheduleAllTab
            onEditProperties={(item) => setEditingItem(item)}
            onEditScripture={(item) => {
              // Editing scripture text is a Starter capability (verse_editing).
              if (requireFeature("verse_editing", "Verse editing"))
                setEditingScripture(item)
            }}
            onEditLexicon={(item) => setEditingLexicon(item)}
            onStageNewItem={(item) => setStagedNewItem(item)}
          />
        </TabsContent>

        <TabsContent value="ai-verses" className="flex min-h-0 flex-1 flex-col">
          <AIVersesTab />
        </TabsContent>

        <TabsContent value="songs" className="flex min-h-0 flex-1 flex-col">
          <ScheduleSongsTab onEditProperties={(item) => setEditingItem(item)} />
        </TabsContent>
      </Tabs>

      <ItemPropertiesModal
        open={editingItem !== null}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null)
        }}
        item={editingItem}
        scheduleId={activeScheduleId ?? ""}
      />

      <ScriptureItemEditModal
        open={editingScripture !== null}
        onOpenChange={(open) => {
          if (!open) setEditingScripture(null)
        }}
        item={editingScripture}
        scheduleId={activeScheduleId ?? ""}
      />

      {editingLexicon?.cardData && activeScheduleId && (
        <LexiconEditModal
          open={editingLexicon !== null}
          onOpenChange={(open) => {
            if (!open) setEditingLexicon(null)
          }}
          card={editingLexicon.cardData}
          mode="edit"
          onSaved={(cardData) => {
            useScheduleStore
              .getState()
              .updateItem(activeScheduleId, editingLexicon.id, {
                cardData,
                slide: buildLexiconSlideFromData(cardData),
                label: lexiconCardDataLabel(cardData),
              })
            toast.success(t("toast.lexicalSummaryUpdated"))
          }}
        />
      )}

      <ItemPropertiesModal
        open={stagedNewItem !== null}
        onOpenChange={(open) => {
          if (!open && stagedNewItem && activeScheduleId) {
            useScheduleStore
              .getState()
              .removeItem(activeScheduleId, stagedNewItem.id)
            setStagedNewItem(null)
          }
        }}
        item={stagedNewItem}
        scheduleId={activeScheduleId ?? ""}
        mode="add"
        onConfirmAdd={(extras) => {
          if (stagedNewItem && activeScheduleId) {
            const store = useScheduleStore.getState()
            // The placeholder went in unchecked; now that the modal has given
            // it real content, check it against the rest of the schedule.
            const staged = useSettingsStore.getState()
              .preventDuplicateScheduleItems
              ? store
                  .getActiveSchedule()
                  ?.items.find((i) => i.id === stagedNewItem.id)
              : undefined
            const stagedDuplicate = staged
              ? store.findDuplicate(activeScheduleId, staged)
              : undefined
            if (stagedDuplicate) {
              store.removeItem(activeScheduleId, stagedNewItem.id)
              store.flashItem(stagedDuplicate.id)
            }
            let added = stagedDuplicate ? 0 : 1
            let skipped = stagedDuplicate ? 1 : 0
            if (extras.length > 0) {
              const schedule = useScheduleStore.getState().getActiveSchedule()
              const itemIdx = schedule?.items.findIndex(
                (i) => i.id === stagedNewItem.id
              )
              let insertAt =
                itemIdx !== undefined && itemIdx >= 0
                  ? itemIdx + 1
                  : (schedule?.items.length ?? 0)
              for (const extra of extras) {
                extra.order = insertAt
                if (
                  useScheduleStore
                    .getState()
                    .insertItemAt(activeScheduleId, extra, insertAt)
                ) {
                  added++
                  insertAt++
                } else {
                  skipped++
                }
              }
            }
            if (added === 0) {
              toast.info(t("toast.alreadyInSchedule"))
            } else {
              toast.success(
                t("toast.itemsAdded", {
                  count: added,
                  type: typeLabels[stagedNewItem.type],
                  skippedSuffix:
                    skipped > 0 ? t("toast.skipped", { count: skipped }) : "",
                })
              )
            }
          }
          setStagedNewItem(null)
        }}
      />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {t("confirm.deleteTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("confirm.deleteDescription", { name: activeSchedule?.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                {t("actions.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
            >
              {t("actions.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
