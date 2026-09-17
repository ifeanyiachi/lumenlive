import { useState } from "react"
import { useTranslation } from "react-i18next"
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBroadcastStore, useTranscriptStore } from "@/stores"

/**
 * Reloads the control-panel webview — a recovery escape hatch for a wedged UI
 * (stuck store, dead listener, post-update refresh) that stops short of quitting
 * the app and tearing down the Rust backend / audio / broadcast windows.
 *
 * Reload is guarded but no longer destructive to the show: the live output (the
 * on-air verse/slide/media) is persisted and restored automatically when a
 * broadcast window is open (see broadcast-store `hydrateBroadcastSession`). The one
 * thing a reload still ends is transcription — the STT pipeline is reset on boot —
 * so the confirmation warns explicitly while transcribing.
 */
export function ReloadButton() {
  const { t } = useTranslation("controls")
  const [open, setOpen] = useState(false)
  // Narrow selects: this button re-renders only when on-air / transcribing flips.
  const isLive = useBroadcastStore((s) => s.isLive)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-foreground"
        title={t("reload.button")}
        aria-label={t("reload.button")}
        onClick={() => setOpen(true)}
      >
        <RotateCwIcon className="size-3.5" />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isTranscribing && (
              <TriangleAlertIcon className="size-4 text-amber-500" />
            )}
            {t("reload.title")}
          </DialogTitle>
          <DialogDescription>
            {t("reload.description")} {" "}
            {isLive && `${t("reload.liveOutputRestored")} `}
            {isTranscribing &&
              `${t("reload.transcriptionStops")} `}
            {t("reload.workPreserved")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              {t("reload.cancel")}
            </Button>
          </DialogClose>
          <Button
            variant={isTranscribing ? "destructive" : "default"}
            size="sm"
            onClick={() => window.location.reload()}
          >
            {t("reload.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
