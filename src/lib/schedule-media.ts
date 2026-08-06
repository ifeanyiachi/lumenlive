import { toast } from "sonner"
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
 */
export function addAssetsToSchedule(assets: MediaAsset[], fromGallery = false) {
  const store = useScheduleStore.getState()
  const { activeScheduleId, activeItemIndex } = store
  if (!activeScheduleId) {
    toast.error("Select or create a schedule first")
    return
  }

  if (!fromGallery) {
    useMediaStore.getState().addAssets(assets)
  }

  const schedule = store.getActiveSchedule()
  let insertAt =
    activeItemIndex !== null
      ? activeItemIndex + 1
      : (schedule?.items.length ?? 0)

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
        ? "Those media files are already in the schedule"
        : "Already in the schedule"
    )
    return
  }
  toast.success(
    `${added} media file${added > 1 ? "s" : ""} added to schedule` +
      (skipped > 0 ? ` · ${skipped} already there` : "")
  )
}
