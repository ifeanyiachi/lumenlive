import { useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PlusIcon } from "lucide-react"
import { ItemPropertiesContent } from "@/components/schedule/item-properties-panel"
import { getTypeLabels } from "@/components/schedule/schedule-utils"
import { useScheduleStore } from "@/stores/schedule-store"
import { useMediaStore } from "@/stores/media-store"
import type { ScheduleItem } from "@/types/schedule"

export function ItemPropertiesModal({
  open,
  onOpenChange,
  item: itemSnapshot,
  scheduleId,
  mode = "edit",
  onConfirmAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ScheduleItem | null
  scheduleId: string
  mode?: "edit" | "add"
  onConfirmAdd?: (extras: ScheduleItem[]) => void
}) {
  const { t } = useTranslation("schedule")
  const typeLabels = getTypeLabels()
  const stagedExtrasRef = useRef<ScheduleItem[]>([])
  const stagedMediaImportIdsRef = useRef<string[]>([])

  const handleStagedExtras = useCallback((extras: ScheduleItem[]) => {
    stagedExtrasRef.current = extras
  }, [])

  const handleStagedMediaImports = useCallback((assetIds: string[]) => {
    stagedMediaImportIdsRef.current = [
      ...stagedMediaImportIdsRef.current,
      ...assetIds,
    ]
  }, [])

  const liveItem = useScheduleStore((s) => {
    if (!itemSnapshot) return null
    const schedule = s.schedules.find((sc) => sc.id === scheduleId)
    return schedule?.items.find((i) => i.id === itemSnapshot.id) ?? null
  })

  const item = liveItem ?? itemSnapshot
  if (!item) return null

  const isAdd = mode === "add"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (stagedMediaImportIdsRef.current.length > 0) {
            useMediaStore
              .getState()
              .removeAssets(new Set(stagedMediaImportIdsRef.current))
            stagedMediaImportIdsRef.current = []
          }
          stagedExtrasRef.current = []
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isAdd
              ? t("properties.addType", { type: typeLabels[item.type] })
              : t("properties.editTitle")}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <ItemPropertiesContent
            item={item}
            scheduleId={scheduleId}
            stagingMode={isAdd}
            onStagedExtras={isAdd ? handleStagedExtras : undefined}
            onStagedMediaImports={isAdd ? handleStagedMediaImports : undefined}
          />
        </ScrollArea>
        {isAdd && (
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                const extras = [...stagedExtrasRef.current]
                stagedExtrasRef.current = []
                stagedMediaImportIdsRef.current = []
                onConfirmAdd?.(extras)
              }}
            >
              <PlusIcon className="size-3" />
              {t("actions.addToSchedule")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
