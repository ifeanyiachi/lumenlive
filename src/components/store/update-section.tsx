import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useUpdateStore } from "@/stores/update-store"
import { Button } from "@/components/ui/button"

/**
 * Thin download-progress bar. Isolated leaf so the per-chunk `progress` updates
 * (many per second) re-render only this element, not the whole panel — follows
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
 * Always-visible "Software Update" panel at the top of the Store page. Unlike a
 * notice that only appears when a newer build ships, this panel is persistent:
 * it always shows the running version and a manual "Check for updates" action,
 * and reflects every state of the update flow (checking, up to date, available,
 * error). The nav dot in the transport bar still uses the dismissable
 * `shouldNotifyUpdate` predicate; this panel intentionally shows the true state
 * regardless of dismissal.
 *
 * Handlers read via getState() so the component doesn't re-subscribe on every
 * store change.
 */
export function UpdateSection() {
  const status = useUpdateStore((s) => s.status)
  const available = useUpdateStore((s) => s.available)
  const currentVersion = useUpdateStore((s) => s.currentVersion)
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt)

  const checking = status === "checking"
  const downloading = status === "downloading"
  const hasUpdate = status === "available" && available !== null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          {hasUpdate ? (
            <Download className="size-4 text-primary" />
          ) : (
            <RefreshCw className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Software Update</p>
          <p className="truncate text-xs text-muted-foreground">
            Current version {currentVersion ?? "unknown"}
          </p>
        </div>

        {hasUpdate ? (
          <Button
            size="sm"
            disabled={downloading}
            onClick={() => void useUpdateStore.getState().install()}
          >
            {downloading ? "Updating…" : "Update now"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={checking}
            onClick={() => void useUpdateStore.getState().check()}
          >
            {checking ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            {checking ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </div>

      {/* Status line + details, reflecting the current flow state */}
      <div className="mt-3">
        {hasUpdate ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">
              LumenLive {available.version} is available
            </p>
            {available.notes && (
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                {available.notes}
              </p>
            )}
            {downloading ? (
              <div className="mt-2">
                <DownloadProgress />
              </div>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                className="mt-1 -ml-2 h-6 text-muted-foreground"
                onClick={() => useUpdateStore.getState().dismiss()}
              >
                Dismiss notification
              </Button>
            )}
          </div>
        ) : status === "error" ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            Couldn&apos;t check for updates. Check your connection and try again.
          </p>
        ) : lastCheckedAt !== null ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            You&apos;re on the latest version.
          </p>
        ) : checking ? (
          <p className="text-xs text-muted-foreground">
            Checking for updates…
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Check whether a newer version of LumenLive is available.
          </p>
        )}
      </div>
    </div>
  )
}
