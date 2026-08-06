import { MinusIcon } from "lucide-react"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { useScheduleStore } from "@/stores/schedule-store"
import type {
  ScheduleItem,
  ScriptureScheduleItem,
  SlideScheduleItem,
  MediaScheduleItem,
  WebScheduleItem,
} from "@/types/schedule"
import { ScriptureProperties } from "./item-properties/scripture-properties"
import { SlideProperties } from "./item-properties/slide-properties"
import { MediaProperties } from "./item-properties/media-properties"
import { WebProperties } from "./item-properties/web-properties"

/**
 * Editor for a single schedule item. Renders the shared Label/Notes fields, then
 * delegates to a per-type editor (scripture / slide / media / web). The per-type
 * editors live in ./item-properties/*.
 */
export function ItemPropertiesContent({
  item,
  scheduleId,
  stagingMode,
  onStagedExtras,
  onStagedMediaImports,
}: {
  item: ScheduleItem
  scheduleId: string
  stagingMode?: boolean
  onStagedExtras?: (extras: ScheduleItem[]) => void
  onStagedMediaImports?: (assetIds: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <FieldGroup label="Label">
        <Input
          className="h-7 text-xs"
          value={item.label}
          onChange={(e) =>
            useScheduleStore
              .getState()
              .updateItem(scheduleId, item.id, { label: e.target.value })
          }
        />
      </FieldGroup>

      <FieldGroup label="Notes">
        <textarea
          className="min-h-[60px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-ring focus:outline-none"
          value={item.notes ?? ""}
          onChange={(e) =>
            useScheduleStore
              .getState()
              .updateItem(scheduleId, item.id, { notes: e.target.value })
          }
          placeholder="Add notes..."
        />
      </FieldGroup>

      {item.type === "scripture" && (
        <ScriptureProperties
          item={item as ScriptureScheduleItem}
          scheduleId={scheduleId}
        />
      )}
      {item.type === "slide" && (
        <SlideProperties
          item={item as SlideScheduleItem}
          scheduleId={scheduleId}
          stagingMode={stagingMode}
          onStagedExtras={onStagedExtras}
        />
      )}
      {item.type === "media" && (
        <MediaProperties
          item={item as MediaScheduleItem}
          scheduleId={scheduleId}
          stagingMode={stagingMode}
          onStagedExtras={onStagedExtras}
          onStagedMediaImports={onStagedMediaImports}
        />
      )}
      {item.type === "web" && (
        <WebProperties item={item as WebScheduleItem} scheduleId={scheduleId} />
      )}
      {item.type === "header" && (
        <div className="flex items-center gap-2 rounded-md bg-muted/30 p-3">
          <MinusIcon className="size-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Section headers are visual dividers only
          </span>
        </div>
      )}
    </div>
  )
}
