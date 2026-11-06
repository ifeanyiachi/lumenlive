import { toast } from "sonner"
import { i18n } from "@/lib/i18n/config"
import { useScheduleStore } from "@/stores/schedule-store"
import { useMediaStore } from "@/stores/media-store"
import { getDefaultMediaFit } from "@/lib/media-fit"
import type { MediaScheduleItem } from "@/types/schedule"
import type { MediaAsset } from "@/types/media"

/**
 * Insert media assets into the active schedule (image, video, or audio — all
 * are supported as media items and play back through the broadcast output).
 *
 * @param fromGallery when true the assets already live in the media library, so
 *   they are not re-added to it.
 * @param insertIndex explicit position to insert at (a drop indicator's target);
 *   when omitted, falls back to just after the active item.
 */
export function addAssetsToSchedule(
  assets: MediaAsset[],
  fromGallery = false,
  insertIndex?: number
) {
  const store = useScheduleStore.getState()
  const { activeScheduleId, activeItemIndex } = store
  if (!activeScheduleId) {
    toast.error(i18n.t("schedule:toast.selectOrCreateFirst"))
    return
  }

  if (!fromGallery) {
    useMediaStore.getState().addAssets(assets)
  }

  const schedule = store.getActiveSchedule()
  let insertAt =
    insertIndex ??
    (activeItemIndex !== null
      ? activeItemIndex + 1
      : (schedule?.items.length ?? 0))

  const defaultFit = getDefaultMediaFit()
  let added = 0

  for (const asset of assets) {
    const item: MediaScheduleItem = {
      id: crypto.randomUUID(),
      type: "media",
      label: asset.name,
      order: insertAt,
      notes: "",
      mediaAssetId: asset.id,
      cachedFilePath: asset.filePath,
      cachedMediaType: asset.type,
      ...defaultFit,
    }
    if (store.insertItemAt(activeScheduleId, item, insertAt)) {
      added++
      insertAt++
    }
  }

  const skipped = assets.length - added
  if (added === 0) {
    toast.info(
      skipped > 1
        ? i18n.t("schedule:toast.mediaAlreadyInSchedule")
        : i18n.t("schedule:toast.alreadyInSchedule")
    )
    return
  }
  toast.success(
    i18n.t("schedule:toast.mediaAdded", {
      count: added,
      skippedSuffix:
        skipped > 0 ? i18n.t("schedule:toast.skipped", { count: skipped }) : "",
    })
  )
}
