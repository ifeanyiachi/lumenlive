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
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

/** Build a "3 themes, 12 songs, 40 media files" style summary from counts. */
function summarize(c: BackupCounts, t: TFunction<"settings">): string {
  const parts: string[] = []
  const add = (n: number, key: string) => {
    if (n > 0) parts.push(t(`backup.summary.${key}`, { count: n }))
  }
  add(c.themes, "themes")
  add(c.stageLayouts, "stageLayouts")
  add(c.presentations, "presentations")
  add(c.songs, "songs")
  add(c.schedules, "schedules")
  add(c.mediaAssets, "mediaAssets")
  add(c.countdownTimers, "countdownTimers")
  add(c.alertTemplates, "alertTemplates")
  add(c.webBookmarks, "webBookmarks")
  return parts.join(", ")
}

export function BackupSection() {
  const { t } = useTranslation("settings")
  const kindLabels: Record<BackupKind, string> = {
    themes: t("backup.kinds.themes"),
    stageLayouts: t("backup.kinds.stageLayouts"),
    presentations: t("backup.kinds.presentations"),
    songs: t("backup.kinds.songs"),
    schedules: t("backup.kinds.schedules"),
    mediaAssets: t("backup.kinds.mediaAssets"),
    countdownTimers: t("backup.kinds.countdownTimers"),
    alertTemplates: t("backup.kinds.alertTemplates"),
  }
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
      const summary = summarize(counts, t)
      if (missingMedia > 0) {
        toast.warning(
          t("backup.savedWithMissingMedia", { summary, count: missingMedia })
        )
      } else {
        toast.success(
          summary
            ? t("backup.savedWithSummary", { summary })
            : t("backup.saved")
        )
      }
    } catch {
      toast.error(t("backup.createFailed"))
    } finally {
      setBusy(null)
    }
  }

  const handleRestore = async () => {
    setBusy("restore")
    try {
      const result = await restoreBackup()
      if (result) {
        const summary = summarize(result.counts, t)
        toast.success(
          summary
            ? t("backup.restoredWithSummary", { summary })
            : t("backup.restored")
        )
      }
    } catch (err) {
      toast.error(
        err instanceof BackupParseError
          ? err.message
          : t("backup.restoreFailed")
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("backup.heading")}
        </label>

        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {t("backup.moveTitle")}
            </span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("backup.moveDescription")}
            </p>
          </div>
          {/* What to include — pick everything, or just the kinds you need. */}
          <div className="flex flex-col gap-px overflow-hidden rounded-md border">
            <SelectRow
              label={t("backup.allContent")}
              emphasized
              checked={allSelected}
              onCheckedChange={toggleAll}
            />
            {BACKUP_KINDS.map((kind) => (
              <SelectRow
                key={kind}
                label={kindLabels[kind]}
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
              {busy === "export" ? t("backup.saving") : t("backup.export")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              disabled={busy !== null}
            >
              <DownloadIcon className="size-4" />
              {busy === "restore" ? t("backup.restoring") : t("backup.restore")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("backup.travelTitle")}
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("backup.included")}
            </span>{" "}
            {t("backup.includedDescription")}
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("backup.notIncluded")}
            </span>{" "}
            {t("backup.notIncludedDescription")}
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("backup.confirmTitle")}
        description={t("backup.confirmDescription")}
        confirmLabel={t("backup.chooseFile")}
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
