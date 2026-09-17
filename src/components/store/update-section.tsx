import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import { useUpdateStore } from "@/stores/update-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Thin download-progress bar. Isolated leaf so the per-chunk `progress` updates
 * (many per second) re-render only this element, not the whole panel — follows
 * the narrow-selector rule from CLAUDE.md.
 *
 * When the update server doesn't advertise a content length (`progressKnown`
 * false), a real percentage is unknowable, so a determinate bar would sit frozen
 * at 0% for the whole download — the "it looks stuck" bug the progress reducer
 * was written to avoid. In that case we render an *indeterminate* bar: a sliver
 * that sweeps across, signalling motion without claiming a percentage.
 */
function DownloadProgress() {
  const progress = useUpdateStore((s) => s.progress)
  const progressKnown = useUpdateStore((s) => s.progressKnown)
  const pct = Math.round(progress * 100)
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      // Omit aria-valuenow while indeterminate so assistive tech announces the
      // bar as busy-without-a-value rather than a misleading 0%.
      aria-valuenow={progressKnown ? pct : undefined}
    >
      <style>
        {`@keyframes lumen-update-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}
      </style>
      {progressKnown ? (
        <div
          className="h-full bg-primary transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      ) : (
        <div
          className="h-full w-1/4 rounded-full bg-primary"
          style={{
            animation: "lumen-update-indeterminate 1.2s ease-in-out infinite",
          }}
        />
      )}
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
  const { t } = useTranslation("store")
  const status = useUpdateStore((s) => s.status)
  const available = useUpdateStore((s) => s.available)
  const currentVersion = useUpdateStore((s) => s.currentVersion)
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt)

  // Local UI state: the release-log modal's open flag. Purely presentational, so
  // it lives here rather than in the update store.
  const [releaseLogOpen, setReleaseLogOpen] = useState(false)

  const checking = status === "checking"
  const downloading = status === "downloading"
  const installing = status === "installing"
  // The download/install runs in the background off a cached handle, so it
  // outlives the "available" status. Keep the action + panel shown throughout so
  // the operator always sees it's working (and can't fire a second download).
  const busy = downloading || installing
  const hasUpdate = status === "available" && available !== null
  const showUpdatePanel = (hasUpdate || busy) && available !== null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          {hasUpdate || busy ? (
            <Download className="size-4 text-primary" />
          ) : (
            <RefreshCw className="size-4 text-muted-foreground" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t("update.title")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t("update.currentVersion", {
              version: currentVersion ?? t("common.unknown"),
            })}
          </p>
        </div>

        {hasUpdate || busy ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void useUpdateStore.getState().install()}
          >
            {busy && <Loader2 className="animate-spin" />}
            {installing
              ? t("common.installing")
              : downloading
                ? t("common.downloading")
                : t("update.updateNow")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={checking}
            onClick={() => void useUpdateStore.getState().check()}
          >
            {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {checking ? t("common.checking") : t("update.check")}
          </Button>
        )}
      </div>

      {/* Status line + details, reflecting the current flow state */}
      <div className="mt-3">
        {showUpdatePanel ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium text-foreground">
              {busy
                ? t("update.updatingTo", { version: available.version })
                : t("update.available", { version: available.version })}
            </p>
            {available.notes && !busy && (
              <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                {available.notes}
              </p>
            )}
            {busy ? (
              <div className="mt-2">
                <DownloadProgress />
              </div>
            ) : (
              <div className="mt-1 -ml-2 flex items-center gap-1">
                {available.notes && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 text-muted-foreground"
                    onClick={() => setReleaseLogOpen(true)}
                  >
                    <FileText />
                    {t("update.viewReleaseLog")}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  className="h-6 text-muted-foreground"
                  onClick={() => useUpdateStore.getState().dismiss()}
                >
                  {t("update.dismissNotification")}
                </Button>
              </div>
            )}
          </div>
        ) : status === "error" ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t("update.checkFailed")}
          </p>
        ) : lastCheckedAt !== null ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            {t("update.latest")}
          </p>
        ) : checking ? (
          <p className="text-xs text-muted-foreground">
            {t("update.checking")}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("update.checkDescription")}
          </p>
        )}
      </div>

      {available && (
        <Dialog open={releaseLogOpen} onOpenChange={setReleaseLogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {t("update.whatsNew", { version: available.version })}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto text-sm text-muted-foreground">
              {available.notes ? (
                <p className="break-words whitespace-pre-wrap">
                  {available.notes}
                </p>
              ) : (
                <p>{t("update.noReleaseNotes")}</p>
              )}
            </div>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
