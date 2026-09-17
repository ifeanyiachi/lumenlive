import { toast } from "sonner"
import { i18n } from "@/lib/i18n/config"
import { useScheduleStore } from "@/stores/schedule-store"
import { usePresentationStore } from "@/stores/presentation-store"
import type { SlideScheduleItem } from "@/types/schedule"

export interface SlideDropData {
  presentationId: string
  presentationName: string
  /** When set, only this single slide is added. When omitted, every slide in
   *  the presentation is added as its own individual (ungrouped) item. */
  slideIndex?: number
}

/**
 * Insert slides from a presentation into the active schedule. Dropping a whole
 * presentation adds each of its slides as a separate schedule item (not one
 * grouped deck); dropping a single slide adds just that one.
 */
export function addSlideToSchedule(
  { presentationId, presentationName, slideIndex }: SlideDropData,
  insertIndex?: number
) {
  const store = useScheduleStore.getState()
  const { activeScheduleId, activeItemIndex } = store
  if (!activeScheduleId) {
    toast.error(i18n.t("schedule:toast.selectOrCreateFirst"))
    return
  }

  const schedule = store.getActiveSchedule()
  let insertAt =
    insertIndex ??
    (activeItemIndex !== null
      ? activeItemIndex + 1
      : (schedule?.items.length ?? 0))

  const presentation = usePresentationStore
    .getState()
    .presentations.find((p) => p.id === presentationId)

  // A single slide when specified, otherwise every slide in the deck — each
  // added as its own item. Fall back to slide 0 if the deck can't be resolved.
  const indices =
    slideIndex !== undefined
      ? [slideIndex]
      : presentation && presentation.slides.length > 0
        ? presentation.slides.map((_, i) => i)
        : [0]

  // A lone slide keeps the presentation name; multiple slides get numbered.
  const numbered = indices.length > 1 || slideIndex !== undefined

  let added = 0
  for (const idx of indices) {
    const item: SlideScheduleItem = {
      id: crypto.randomUUID(),
      type: "slide",
      label: numbered
        ? `${presentationName} — Slide ${idx + 1}`
        : presentationName,
      order: insertAt,
      notes: "",
      presentationId,
      slideIndex: idx,
      groupSlides: false,
    }
    if (store.insertItemAt(activeScheduleId, item, insertAt)) {
      added++
      insertAt++
    }
  }

  const skipped = indices.length - added
  if (added === 0) {
    toast.info(
      skipped > 1
        ? i18n.t("schedule:toast.slidesAlreadyInSchedule")
        : i18n.t("schedule:toast.alreadyInSchedule")
    )
    return
  }
  toast.success(
    i18n.t("schedule:toast.slidesAdded", {
      count: added,
      skippedSuffix:
        skipped > 0 ? i18n.t("schedule:toast.skipped", { count: skipped }) : "",
    })
  )
}
