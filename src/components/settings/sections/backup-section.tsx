import { useState } from "react"
import { toast } from "sonner"
import { DownloadIcon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  exportBackup,
  restoreBackup,
  fullSelection,
  BACKUP_KINDS,
  type BackupCounts,
  type BackupKind,
} from "@/lib/backup/io"
import { BackupParseError } from "@/lib/backup"

/** Human labels for each selectable content kind, in display order. */
const KIND_LABELS: Record<BackupKind, string> = {
  themes: "Themes",
  stageLayouts: "Stage layouts",
  presentations: "Presentations",
  songs: "Songs",
  schedules: "Schedules",
  mediaAssets: "Media library",
  countdownTimers: "Timers",
  alertTemplates: "Alerts",
}

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
  // What to include in an export — everything by default.
  const [selection, setSelection] = useState<Set<BackupKind>>(fullSelection)

  const allSelected = selection.size === BACKUP_KINDS.length
  const noneSelected = selection.size === 0

  const toggleKind = (kind: BackupKind, on: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev)
      if (on) next.add(kind)
      else next.delete(kind)
      return next
    })
  }

  const toggleAll = (on: boolean) => {
    setSelection(on ? fullSelection() : new Set())
  }

  const handleExport = async () => {
    setBusy("export")
    try {
      const { saved, missingMedia, counts } = await exportBackup(selection)
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
              Move your content to a new PC
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Save your content — custom themes, stage layouts, presentations,
              songs, schedules, timers, alerts and the media library (images and
              videos included) — into a single backup file, then restore it on
              another computer. Pick everything, or just the kinds you need.
              Restore accepts any backup and merges in whatever it holds.
            </p>
          </div>
          {/* What to include — pick everything, or just the kinds you need. */}
          <div className="flex flex-col gap-px overflow-hidden rounded-md border">
            <SelectRow
              label="All content"
              emphasized
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            {BACKUP_KINDS.map((kind) => (
              <SelectRow
                key={kind}
                label={KIND_LABELS[kind]}
                checked={selection.has(kind)}
                onCheckedChange={(on) => toggleKind(kind, on)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={busy !== null || noneSelected}
            >
              <UploadIcon className="size-4" />
              {busy === "export" ? "Saving…" : "Export backup"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
            >
              <DownloadIcon className="size-4" />
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

/** One selectable content-kind row in the export picker. */
function SelectRow({
  label,
  checked,
  onCheckedChange,
  emphasized = false,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  emphasized?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 bg-card px-3 py-2 hover:bg-muted/50">
      <span
        className={
          emphasized
            ? "text-xs font-medium text-foreground"
            : "text-xs text-muted-foreground"
        }
      >
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
