import { useState, useEffect, useCallback } from "react"
import { LayoutIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { usePresentationStore } from "@/stores/presentation-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { cn } from "@/lib/utils"
import type { ScheduleItem, SlideScheduleItem } from "@/types/schedule"

export function SlideProperties({
  item,
  scheduleId,
  stagingMode,
  onStagedExtras,
}: {
  item: SlideScheduleItem
  scheduleId: string
  stagingMode?: boolean
  onStagedExtras?: (extras: ScheduleItem[]) => void
}) {
  const presentations = usePresentationStore((s) => s.presentations)
  const selectedPresentation = presentations.find(
    (p) => p.id === item.presentationId
  )
  const [addMode, setAddMode] = useState<"group" | "individual">("individual")

  const handlePresentationChange = useCallback(
    (presentationId: string) => {
      const pres = presentations.find((p) => p.id === presentationId)
      useScheduleStore.getState().updateItem(scheduleId, item.id, {
        presentationId,
        slideIndex: 0,
        label: pres?.name ?? item.label,
      })
    },
    [presentations, scheduleId, item.id, item.label]
  )

  useEffect(() => {
    if (!stagingMode || !selectedPresentation) {
      onStagedExtras?.([])
      return
    }
    if (addMode === "group" || selectedPresentation.slides.length <= 1) {
      useScheduleStore.getState().updateItem(scheduleId, item.id, {
        groupSlides: true,
      })
      onStagedExtras?.([])
      return
    }
    const extras: SlideScheduleItem[] = selectedPresentation.slides
      .slice(1)
      .map((_, idx) => ({
        id: crypto.randomUUID(),
        type: "slide",
        label: `${selectedPresentation.name} - Slide ${idx + 2}`,
        order: 0,
        notes: "",
        presentationId: selectedPresentation.id,
        slideIndex: idx + 1,
        groupSlides: false,
      }))
    useScheduleStore.getState().updateItem(scheduleId, item.id, {
      label: `${selectedPresentation.name} - Slide 1`,
      groupSlides: false,
    })
    onStagedExtras?.(extras)
    // Deps are deliberately narrowed to the staging inputs; including the
    // onStagedExtras callback (unstable identity) would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stagingMode,
    selectedPresentation?.id,
    selectedPresentation?.slides.length,
    addMode,
  ])

  return (
    <>
      <div className="flex items-center gap-2 rounded-md bg-purple-500/10 p-2">
        <LayoutIcon className="size-3.5 text-purple-400" />
        <span className="text-xs font-medium text-purple-400">
          Presentation
        </span>
      </div>

      <FieldGroup label="Presentation">
        <select
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={item.presentationId}
          onChange={(e) => handlePresentationChange(e.target.value)}
        >
          <option value="">Select a presentation...</option>
          {presentations.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.slides.length}{" "}
              {p.slides.length === 1 ? "slide" : "slides"})
            </option>
          ))}
        </select>
      </FieldGroup>

      {stagingMode &&
        selectedPresentation &&
        selectedPresentation.slides.length > 1 && (
          <FieldGroup label="Add slides as">
            <div className="flex gap-1">
              <Button
                variant={addMode === "individual" ? "secondary" : "outline"}
                size="sm"
                className={cn(
                  "h-7 flex-1 text-xs",
                  addMode === "individual" && "ring-1 ring-primary/40"
                )}
                onClick={() => setAddMode("individual")}
              >
                Individual ({selectedPresentation.slides.length})
              </Button>
              <Button
                variant={addMode === "group" ? "secondary" : "outline"}
                size="sm"
                className={cn(
                  "h-7 flex-1 text-xs",
                  addMode === "group" && "ring-1 ring-primary/40"
                )}
                onClick={() => setAddMode("group")}
              >
                Group (1)
              </Button>
            </div>
            <p className="text-[0.625rem] text-muted-foreground">
              {addMode === "individual"
                ? `Each slide will be a separate schedule item (${selectedPresentation.slides.length} items)`
                : "All slides grouped as a single schedule item"}
            </p>
          </FieldGroup>
        )}

      {!stagingMode &&
        selectedPresentation &&
        selectedPresentation.slides.length > 1 && (
          <FieldGroup label="Starting Slide">
            <Input
              type="number"
              className="h-7 text-xs"
              value={item.slideIndex + 1}
              min={1}
              max={selectedPresentation.slides.length}
              onChange={(e) => {
                const idx = Math.max(
                  0,
                  Math.min(
                    Number(e.target.value) - 1,
                    selectedPresentation.slides.length - 1
                  )
                )
                useScheduleStore
                  .getState()
                  .updateItem(scheduleId, item.id, { slideIndex: idx })
              }}
            />
          </FieldGroup>
        )}

      {presentations.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No presentations yet. Create one from the Slides tab.
        </p>
      )}

      {item.presentationId && !stagingMode && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            usePresentationStore.getState().startEditing(item.presentationId)
          }}
        >
          Edit Presentation
        </Button>
      )}
    </>
  )
}
