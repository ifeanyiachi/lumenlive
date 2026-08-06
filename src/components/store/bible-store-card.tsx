import { memo } from "react"
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react"
import type { CatalogEntry } from "@/types/resource-store"
import { Button } from "@/components/ui/button"
import { useResourceStore } from "@/stores/resource-store"
import {
  bibleDisplayMeta,
  languageLabel,
  formatBytes,
} from "@/lib/resource-store"
import InstallProgressBar from "./install-progress"
import { cn } from "@/lib/utils"

/**
 * A rich Bible-version store card: colored abbreviation badge, title + featured
 * star, a "language · verses · size" metadata row, a one-line description, and
 * a status-driven action (Download / Installed / Update / Installing).
 *
 * `memo`ed with plain-data props only; the install/remove handlers are read from
 * the store via `getState()` so they stay stable and the memo holds (perf rule
 * 3). Only Bible resources render here — the store serves no other kind yet.
 */
function BibleStoreCard({ entry }: { entry: CatalogEntry }) {
  const { resource } = entry
  const id = resource.id
  const op = useResourceStore((s) => s.itemState[id])

  if (resource.kind !== "bible") return null
  const meta = bibleDisplayMeta(resource.abbreviation)
  // User imports have no manifest facts; the display table's verse count /
  // description (keyed by abbreviation) would be a guess, so suppress them.
  const imported = entry.installed?.imported === true

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white",
            meta.badgeClass
          )}
        >
          {resource.abbreviation}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {resource.title}
            </h3>
            {imported ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
                Imported
              </span>
            ) : (
              meta.featured && (
                <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
              )
            )}
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              languageLabel(resource.language),
              !imported && meta.verses
                ? `${meta.verses.toLocaleString()} verses`
                : null,
              resource.bytes ? formatBytes(resource.bytes) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {!imported && meta.description && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/90">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {op === "installing" && (
        <div className="mt-3">
          <InstallProgressBar resourceId={id} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <CardAction entry={entry} op={op} />
      </div>
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
  const { status } = entry
  const busy = op !== undefined

  if (op === "installing") {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 className="animate-spin" /> Installing
      </Button>
    )
  }
  if (op === "removing") {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 className="animate-spin" /> Removing
      </Button>
    )
  }

  switch (status) {
    case "available":
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => useResourceStore.getState().install(entry)}
        >
          <Download /> Download
        </Button>
      )
    case "update-available":
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => useResourceStore.getState().install(entry)}
        >
          <RefreshCw /> Update
        </Button>
      )
    case "installed": {
      // Bundled resources (e.g. KJV) are the offline baseline — installed but
      // not removable, so no delete affordance.
      const bundled = entry.installed?.bundled === true
      return (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="size-4" /> Installed
          </span>
          {!bundled && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Remove ${entry.resource.title}`}
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
