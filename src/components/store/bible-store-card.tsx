import { memo } from "react"
import { useTranslation } from "react-i18next"
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { CatalogEntry } from "@/types/resource-store"
import { Button } from "@/components/ui/button"
import { useResourceStore } from "@/stores/resource-store"
import { bibleDisplayMeta, formatBytes } from "@/lib/resource-store"
import InstallProgressBar from "./install-progress"

/**
 * A compact Bible-translation list row with a status-driven action. The
 * language is supplied by the parent accordion, so each row only needs the
 * abbreviation, title, metadata, and action.
 *
 * `memo`ed with plain-data props only; the install/remove handlers are read from
 * the store via `getState()` so they stay stable and the memo holds (perf rule
 * 3). Only Bible resources render here — the store serves no other kind yet.
 */
function BibleStoreCard({ entry }: { entry: CatalogEntry }) {
  const { t } = useTranslation("store")
  const { resource } = entry
  const id = resource.id
  const op = useResourceStore((s) => s.itemState[id])

  if (resource.kind !== "bible") return null
  const meta = bibleDisplayMeta(resource.abbreviation)
  // User imports have no manifest facts; the display table's verse count /
  // description (keyed by abbreviation) would be a guess, so suppress them.
  const imported = entry.installed?.imported === true

  return (
    <div className="flex flex-col py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-normal text-foreground">
            <span>{resource.abbreviation}</span>
            <span className="text-muted-foreground"> · </span>
            {resource.title}
            {imported && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t("bibleCard.imported")}
              </span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              !imported && meta.verses
                ? t("bibleCard.verseCount", { count: meta.verses })
                : null,
              resource.bytes ? formatBytes(resource.bytes) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <CardAction entry={entry} op={op} />
      </div>

      {op === "installing" && (
        <div className="mt-2">
          <InstallProgressBar resourceId={id} />
        </div>
      )}
    </div>
  )
}

function CardAction({
  entry,
  op,
}: {
  entry: CatalogEntry
  op: "installing" | "removing" | undefined
}) {
  const { t } = useTranslation("store")
  const { status } = entry
  const busy = op !== undefined

  if (op === "installing") {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  }
  if (op === "removing") {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />
  }

  switch (status) {
    case "available":
      return (
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          title={t("common.download")}
          aria-label={`${t("common.download")} ${entry.resource.title}`}
          onClick={() => useResourceStore.getState().install(entry)}
        >
          <Download />
        </Button>
      )
    case "update-available":
      return (
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          title={t("common.update")}
          aria-label={`${t("common.update")} ${entry.resource.title}`}
          onClick={() => useResourceStore.getState().install(entry)}
        >
          <RefreshCw />
        </Button>
      )
    case "installed": {
      // Bundled resources (e.g. KJV) are the offline baseline — installed but
      // not removable, so no delete affordance.
      const bundled = entry.installed?.bundled === true
      return (
        <div className="flex items-center gap-1.5">
          <span
            className="flex items-center text-emerald-500"
            title={t("common.installed")}
            aria-label={t("common.installed")}
          >
            <CheckCircle2 className="size-4" />
          </span>
          {!bundled && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("bibleCard.remove", {
                title: entry.resource.title,
              })}
              disabled={busy}
              onClick={() => useResourceStore.getState().remove(entry)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )
    }
    case "byo-import":
      // Copyrighted translations we don't distribute are filtered out of the
      // catalog now; users bring their own via the toolbar Import button.
      return null
    default:
      return null
  }
}

export default memo(BibleStoreCard)
