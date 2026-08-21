import { Download, X } from "lucide-react"
import { useUpdateStore } from "@/stores/update-store"
import { shouldNotifyUpdate } from "@/lib/updater/version"
import { Button } from "@/components/ui/button"

/**
 * Thin download-progress bar. Isolated leaf so the per-chunk `progress` updates
 * (many per second) re-render only this element, not the whole banner — follows
 * the narrow-selector rule from CLAUDE.md.
 */
function DownloadProgress() {
  const progress = useUpdateStore((s) => s.progress)
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-primary transition-[width] duration-150"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  )
}

/**
 * Dismissable "update available" notice at the top of the Store page. Its
 * visibility is driven by the same `shouldNotifyUpdate` predicate as the nav
 * dot, so dismissing here clears both. Dismissal is version-scoped and persisted
 * (see update-store), so the banner stays hidden until a newer build ships.
 *
 * Handlers read via getState() so this component doesn't re-subscribe on every
 * store change.
 */
export function UpdateBanner() {
  const available = useUpdateStore((s) => s.available)
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion)
  const status = useUpdateStore((s) => s.status)

  if (!shouldNotifyUpdate(available, dismissedVersion) || !available) {
    return null
  }

  const downloading = status === "downloading"

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-3">
        <Download className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            LumenLive {available.version} is available
          </p>
          {available.notes && (
            <p className="truncate text-xs text-muted-foreground">
              {available.notes}
            </p>
          )}
        </div>
        <Button
          size="sm"
          disabled={downloading}
          onClick={() => void useUpdateStore.getState().install()}
        >
          {downloading ? "Updating…" : "Update now"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          disabled={downloading}
          aria-label="Dismiss update notice"
          onClick={() => useUpdateStore.getState().dismiss()}
        >
          <X className="size-4" />
        </Button>
      </div>
      {downloading && (
        <div className="mt-2">
          <DownloadProgress />
        </div>
      )}
    </div>
  )
}
