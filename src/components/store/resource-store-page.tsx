import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  BookOpen,
  Clapperboard,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Music,
  Package,
  RefreshCw,
  Search,
  Type,
  Upload,
} from "lucide-react"
import { useResourceStore } from "@/stores/resource-store"
import type { CatalogEntry } from "@/types/resource-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import BibleStoreCard from "./bible-store-card"
import { ImportBibleDialog } from "./import-bible-dialog"
import { SongPacksSection } from "./song-packs-section"
import { UpdateSection } from "./update-section"
import { languageLabel } from "@/lib/resource-store"
import { cn } from "@/lib/utils"

/**
 * The full-page resource store (the "Store" tab). Browses and installs Bible
 * versions — the only resource kind the backend serves today. The other
 * categories are shown, disabled, to preview what's coming; they carry no
 * catalog yet.
 *
 * Catalog load and the progress-event subscription are wired on mount; the
 * subscription's disposer runs on unmount so the listener is never orphaned.
 * Handlers are read via `getState()` so the effects don't re-bind.
 */

/** Category filter chips. Only "bible" has a live catalog; the rest preview. */
const CATEGORIES = [
  { id: "all", icon: Package, enabled: true },
  { id: "templates", icon: LayoutTemplate, enabled: false },
  { id: "titles", icon: Type, enabled: false },
  { id: "songs", icon: Music, enabled: true },
  { id: "backgrounds", icon: ImageIcon, enabled: false },
  { id: "videos", icon: Clapperboard, enabled: false },
  { id: "bible", icon: BookOpen, enabled: true },
] as const

type CategoryId = (typeof CATEGORIES)[number]["id"]

const ALL_LANGUAGES = "all"
const alphabetical = new Intl.Collator(undefined, { sensitivity: "base" })

export function ResourceStorePage() {
  const { t } = useTranslation("store")
  const catalog = useResourceStore((s) => s.catalog)
  const loading = useResourceStore((s) => s.loading)
  const error = useResourceStore((s) => s.error)

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<CategoryId>("all")
  const [language, setLanguage] = useState(ALL_LANGUAGES)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    void useResourceStore.getState().loadCatalog()
  }, [])

  useEffect(() => {
    let active = true
    let dispose: (() => void) | undefined
    void useResourceStore
      .getState()
      .initProgress()
      .then((d) => {
        if (active) dispose = d
        else d()
      })
    return () => {
      active = false
      dispose?.()
    }
  }, [])

  const bibleLanguages = useMemo(
    () =>
      Array.from(
        new Set(
          catalog
            .filter((entry) => entry.resource.kind === "bible")
            .filter((entry) => entry.status !== "byo-import")
            .map((entry) => languageLabel(entry.resource.language))
        )
      ).sort(alphabetical.compare),
    [catalog]
  )

  const bibles = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      catalog
        .filter((e) => e.resource.kind === "bible")
        // Only show translations we actually provide or that are already
        // installed. `byo-import` placeholders (copyrighted versions we don't
        // distribute) are dropped — users add those with the Import button.
        .filter((e) => e.status !== "byo-import")
        .filter(
          (e) =>
            language === ALL_LANGUAGES ||
            languageLabel(e.resource.language) === language
        )
        .filter((e) => {
          if (!q) return true
          const r = e.resource
          const abbrev = r.kind === "bible" ? r.abbreviation : ""
          return (
            r.title.toLowerCase().includes(q) ||
            abbrev.toLowerCase().includes(q)
          )
        })
        // The preceding filters return a new array, so sorting here never
        // mutates the catalog held by the store.
        .sort((a, b) =>
          alphabetical.compare(a.resource.title, b.resource.title)
        )
    )
  }, [catalog, language, query])

  const showBibles = category === "all" || category === "bible"
  const showSongs = category === "all" || category === "songs"

  return (
    <div className="flex w-full flex-col gap-6 px-8 py-8">
      {/* Always-visible software update panel: current version + manual check */}
      <UpdateSection />

      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Package className="mt-1 size-7 shrink-0 text-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("page.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("page.description")}
            </p>
          </div>
        </div>
      </header>

      {/* Search + actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            className="h-10 pl-9"
          />
        </div>
        <Button
          variant="outline"
          className="h-10"
          disabled={loading}
          onClick={() => void useResourceStore.getState().loadCatalog()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("common.refresh")}
        </Button>
        <Button
          variant="outline"
          className="h-10"
          onClick={() => setImportOpen(true)}
          title={t("page.importBibleTitle")}
        >
          <Upload />
          {t("common.import")}
        </Button>
      </div>

      <ImportBibleDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((c) => {
          const Icon = c.icon
          const active = category === c.id
          return (
            <button
              key={c.id}
              type="button"
              disabled={!c.enabled}
              title={c.enabled ? undefined : t("common.comingSoon")}
              onClick={() => setCategory(c.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                !c.enabled &&
                  "cursor-not-allowed opacity-40 hover:text-muted-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {t(`categories.${c.id}`)}
            </button>
          )
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => useResourceStore.getState().clearError()}
          >
            {t("common.dismiss")}
          </Button>
        </div>
      )}

      {/* Community song packs */}
      {showSongs && <SongPacksSection />}

      {/* Bible Versions section */}
      {showBibles && (
        <BibleSection
          entries={bibles}
          languages={bibleLanguages}
          language={language}
          loading={loading}
          onLanguageChange={setLanguage}
        />
      )}
    </div>
  )
}

function BibleSection({
  entries,
  languages,
  language,
  loading,
  onLanguageChange,
}: {
  entries: CatalogEntry[]
  languages: string[]
  language: string
  loading: boolean
  onLanguageChange: (language: string) => void
}) {
  const { t } = useTranslation("store")
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            {t("categories.bible")}
          </h2>
        </div>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger
            className="h-9 min-w-40"
            aria-label={t("bibles.filterLanguage")}
          >
            <SelectValue placeholder={t("bibles.allLanguages")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_LANGUAGES}>
              {t("bibles.allLanguages")}
            </SelectItem>
            {languages.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && entries.length === 0 ? (
        <EmptyState
          icon={<Loader2 className="animate-spin" />}
          title={t("bibles.loading")}
          live
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("bibles.empty")}
          description={t("bibles.emptyDescription")}
          live
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          {entries.map((entry) => (
            <BibleStoreCard key={entry.resource.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}
