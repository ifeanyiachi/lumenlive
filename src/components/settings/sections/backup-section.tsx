import { useState } from "react"
import { toast } from "sonner"
import { DownloadIcon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  exportBackup,
  restoreBackup,
  type BackupCounts,
} from "@/lib/backup/io"
import { BackupParseError } from "@/lib/backup"

/** Build a "3 themes, 12 songs, 40 media files" style summary from counts. */
function summarize(c: BackupCounts): string {
  const parts: string[] = []
  const add = (n: number, one: string, many = `${one}s`) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
  }
  add(c.themes, "theme")
  add(c.stageLayouts, "stage layout")
  add(c.presentations, "presentation")
  add(c.songs, "song")
  add(c.schedules, "schedule")
  add(c.mediaAssets, "media file")
  add(c.countdownTimers, "timer")
  add(c.alertTemplates, "alert")
  add(c.webBookmarks, "bookmark")
  return parts.join(", ")
}

export function BackupSection() {
  const [busy, setBusy] = useState<"export" | "restore" | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleExport = async () => {
    setBusy("export")
    try {
      const { saved, missingMedia, counts } = await exportBackup()
      if (!saved) return
      const summary = summarize(counts)
      if (missingMedia > 0) {
        toast.warning(
          `Backup saved (${summary}) · ${missingMedia} media file${
            missingMedia > 1 ? "s were" : " was"
          } missing and couldn't be packaged`
        )
      } else {
        toast.success(`Backup saved${summary ? ` · ${summary}` : ""}`)
      }
    } catch {
      toast.error("Couldn't create that backup.")
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async () => {
    setBusy("restore")
    try {
      const result = await restoreBackup()
      if (result) {
        const summary = summarize(result.counts)
        toast.success(`Backup restored${summary ? ` · ${summary}` : ""}`)
      }
    } catch (err) {
      toast.error(
        err instanceof BackupParseError
          ? err.message
          : "Couldn't restore that backup."
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Backup &amp; Restore
        </label>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              Move everything to a new PC
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Save your whole content library — custom themes, stage layouts,
              presentations, songs, schedules, the media library (images and
              videos included), countdown timers, alerts and bookmarks — into a
              single backup file, then restore it on another computer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={busy !== null}
            >
              <DownloadIcon className="size-4" />
              {busy === "export" ? "Saving…" : "Export backup"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
            >
              <UploadIcon className="size-4" />
              {busy === "restore" ? "Restoring…" : "Restore backup"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            What travels — and what doesn't
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Included:</span> all
            your custom content and the media files it uses, so backgrounds and
            videos still play on the new machine.
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Not included:</span>{" "}
            app settings and API keys (re-enter those on the new PC), and Bible
            translations (re-download them from the Bible settings). Restoring
            adds to — and updates — your current library; it never deletes what's
            already there.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Restore from a backup?"
        description="This merges the backup's content into your library, updating any items that share an id. Your existing content is kept. Continue?"
        confirmLabel="Choose file…"
        destructive={false}
        onConfirm={handleRestore}
      />
    </div>
  )
}
