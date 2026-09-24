import { Download, Loader2, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { shouldNotifyUpdate } from "@/lib/updater/version"
import { useUpdateStore } from "@/stores/update-store"

/**
 * First-run update notice. The dialog is controlled by the version-scoped
 * dismissal marker in the update store, so closing it also prevents the same
 * release from interrupting the user again. A newer release naturally passes
 * the predicate and opens the dialog again.
 */
export function UpdateNotificationDialog() {
  const { t } = useTranslation("store")
  const available = useUpdateStore((s) => s.available)
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion)
  const status = useUpdateStore((s) => s.status)

  const open = shouldNotifyUpdate(available, dismissedVersion)
  if (!available) return null

  const busy = status === "downloading" || status === "installing"

  function dismiss() {
    useUpdateStore.getState().dismiss()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) dismiss()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-primary/15 bg-primary/[0.06] px-6 pt-7 pb-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <DialogHeader className="mt-5 gap-2">
            <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-primary uppercase">
              {t("update.newVersion")}
            </p>
            <DialogTitle className="text-xl tracking-tight">
              {t("update.available", { version: available.version })}
            </DialogTitle>
            <DialogDescription className="max-w-[42ch] text-sm leading-relaxed">
              {t("update.dialogDescription")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">
              v{available.version}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t("update.releaseReady")}</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">
              {t("update.releaseNotes")}
            </p>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-border/70 bg-muted/35 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
              {available.notes ? (
                <p className="break-words whitespace-pre-wrap">
                  {available.notes}
                </p>
              ) : (
                <p>{t("update.noReleaseNotes")}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={dismiss}>
              {t("update.dismissNotification")}
            </Button>
            <Button
              onClick={() => void useUpdateStore.getState().install()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {busy
                ? status === "installing"
                  ? t("common.installing")
                  : t("common.downloading")
                : t("update.updateNow")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
