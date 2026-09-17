import { memo, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  Music,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSongStore } from "@/stores/song-store"
import {
  COMMUNITY_PACKS,
  installedPacks,
  stampImportBatch,
  type CommunityPack,
  type InstalledPack,
} from "@/lib/song/community-packs"
import { importSongsFromPack } from "@/lib/song/import/from-pack"
import { formatNumber } from "@/lib/i18n/format"
import { fetchSongPack } from "@/services/song-pack-gateway"

/**
 * The Store's "Songs → Community" section. Two kinds of card:
 *
 *  • Curated packs (`COMMUNITY_PACKS`) — always shown, install/reinstall/remove.
 *  • Any *other* installed pack — every batch found in the library whose id isn't
 *    a curated one (i.e. packs the user pasted into the "Community pack…" URL
 *    dialog). These surface here so they too can be uninstalled from one place.
 *
 * Installed state is derived from the library in a single pass (`installedPacks`)
 * and only recomputed when the library changes — not a hot path. Cards read store
 * actions via `getState()` so they stay stable.
 */
export function SongPacksSection() {
  const { t } = useTranslation("store")
  const songs = useSongStore((s) => s.songs)

  const installed = useMemo(() => installedPacks(songs), [songs])
  const byBatchId = useMemo(
    () => new Map(installed.map((p) => [p.batchId, p])),
    [installed]
  )
  // Installed batches that aren't one of the curated packs (added by URL).
  const customPacks = useMemo(
    () => installed.filter((p) => !p.pack),
    [installed]
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Music className="size-5 text-foreground" />
        <h2 className="text-lg font-semibold text-foreground">
          {t("songPacks.title")}
        </h2>
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        {t("songPacks.description")}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {COMMUNITY_PACKS.map((pack) => (
          <CuratedPackCard
            key={pack.id}
            pack={pack}
            installedCount={byBatchId.get(pack.id)?.count ?? 0}
          />
        ))}
        {customPacks.map((pack) => (
          <CustomPackCard key={pack.batchId} pack={pack} />
        ))}
      </div>
    </section>
  )
}

/**
 * Shared install/remove machinery for a pack card. `install` fetches the ZIP,
 * parses it in the pure import layer, stamps the batch, and batch-adds; `remove`
 * deletes every song of the batch. Local `busy`/`received` drive the card's UI.
 */
function usePackInstaller() {
  const { t } = useTranslation("store")
  const [busy, setBusy] = useState<"installing" | "removing" | null>(null)
  const [received, setReceived] = useState(0)

  const install = async (batchId: string, url: string, name: string) => {
    if (busy) return
    setBusy("installing")
    setReceived(0)
    try {
      const bytes = await fetchSongPack(url, ({ received }) =>
        setReceived(received)
      )
      const parsed = await importSongsFromPack(bytes)
      if (parsed.length === 0) {
        toast.error(t("songPacks.noSongs", { name }))
        return
      }
      const stamped = stampImportBatch(parsed, batchId, name)
      useSongStore.getState().addSongs(stamped)
      toast.success(
        t("songPacks.installedFrom", { count: stamped.length, name })
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("songPacks.installFailed")
      )
    } finally {
      setBusy(null)
    }
  }

  const remove = (batchId: string, name: string) => {
    if (busy) return
    setBusy("removing")
    try {
      const removed = useSongStore.getState().removeSongsByBatch(batchId)
      toast(t("songPacks.removedFrom", { count: removed, name }))
    } finally {
      setBusy(null)
    }
  }

  return { busy, received, install, remove }
}

function PackCardShell({
  icon,
  header,
  received,
  busy,
  actions,
}: {
  icon: React.ReactNode
  header: React.ReactNode
  received: number
  busy: "installing" | "removing" | null
  actions: React.ReactNode
}) {
  const { t } = useTranslation("store")
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0 flex-1">{header}</div>
      </div>

      {busy === "installing" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t("songPacks.downloading", {
            size: formatNumber(received / 1_000_000, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }),
          })}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end gap-1.5">
        {actions}
      </div>
    </div>
  )
}

function CuratedPackCardInner({
  pack,
  installedCount,
}: {
  pack: CommunityPack
  installedCount: number
}) {
  const { t } = useTranslation("store")
  const { busy, received, install, remove } = usePackInstaller()
  const installed = installedCount > 0

  return (
    <PackCardShell
      icon={<Music className="size-5" />}
      received={received}
      busy={busy}
      header={
        <>
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {pack.name}
            </h3>
            {pack.publicDomain ? (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-emerald-500"
                title={t("songPacks.publicDomainTitle")}
              >
                <ShieldCheck className="size-3" />
                {t("songPacks.publicDomain")}
              </span>
            ) : (
              pack.recommended && (
                <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
              )
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              t("songPacks.by", { author: pack.author }),
              pack.formats,
              pack.language,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground/90">
            {pack.description}
          </p>
          <SourceLink url={pack.url} />
        </>
      }
      actions={
        <>
          {installed && !busy && <InstalledBadge count={installedCount} />}
          {busy ? (
            <BusyButton busy={busy} />
          ) : installed ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void install(pack.id, pack.url, pack.name)}
              >
                <Download /> {t("common.reinstall")}
              </Button>
              <RemoveButton
                label={pack.name}
                onClick={() => remove(pack.id, pack.name)}
              />
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void install(pack.id, pack.url, pack.name)}
            >
              <Download /> {t("common.install")}
            </Button>
          )}
        </>
      }
    />
  )
}

function CustomPackCardInner({ pack }: { pack: InstalledPack }) {
  const { t } = useTranslation("store")
  const { busy, received, install, remove } = usePackInstaller()
  // For URL-added packs the batch id *is* the source URL, so reinstall works.
  const isUrl = /^https?:\/\//.test(pack.batchId)

  return (
    <PackCardShell
      icon={<Music className="size-5" />}
      received={received}
      busy={busy}
      header={
        <>
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {pack.name}
            </h3>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
              {t("songPacks.addedByUrl")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("songPacks.communityPack")}
          </p>
          {isUrl && <SourceLink url={pack.batchId} />}
        </>
      }
      actions={
        <>
          {!busy && <InstalledBadge count={pack.count} />}
          {busy ? (
            <BusyButton busy={busy} />
          ) : (
            <>
              {isUrl && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void install(pack.batchId, pack.batchId, pack.name)
                  }
                >
                  <Download /> {t("common.reinstall")}
                </Button>
              )}
              <RemoveButton
                label={pack.name}
                onClick={() => remove(pack.batchId, pack.name)}
              />
            </>
          )}
        </>
      }
    />
  )
}

function InstalledBadge({ count }: { count: number }) {
  const { t } = useTranslation("store")
  return (
    <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-emerald-500">
      <CheckCircle2 className="size-4" />
      {t("songPacks.installedCount", { count })}
    </span>
  )
}

function BusyButton({ busy }: { busy: "installing" | "removing" }) {
  const { t } = useTranslation("store")
  return (
    <Button size="sm" variant="secondary" disabled>
      <Loader2 className="animate-spin" />
      {t(busy === "installing" ? "common.installing" : "common.removing")}
    </Button>
  )
}

function RemoveButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  const { t } = useTranslation("store")
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={t("songPacks.remove", { label })}
      onClick={onClick}
    >
      <Trash2 />
    </Button>
  )
}

function SourceLink({ url }: { url: string }) {
  const { t } = useTranslation("store")
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground hover:text-foreground"
    >
      <ExternalLink className="size-3" />
      {t("songPacks.viewSource")}
    </a>
  )
}

const CuratedPackCard = memo(CuratedPackCardInner)
const CustomPackCard = memo(CustomPackCardInner)
