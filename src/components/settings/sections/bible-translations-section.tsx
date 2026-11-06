import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Upload,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { languageLabel } from "@/lib/resource-store"
import type { CatalogEntry } from "@/types/resource-store"
import { useResourceStore } from "@/stores/resource-store"

import BibleStoreCard from "../../store/bible-store-card"
import { ImportBibleDialog } from "../../store/import-bible-dialog"

const alphabetical = new Intl.Collator(undefined, { sensitivity: "base" })

interface TranslationGroup {
  language: string
  entries: CatalogEntry[]
}

/**
 * Catalog-backed Bible management for Settings. Keeping this beside the
 * primary-translation picker makes installation and selection one workflow.
 */
export function BibleTranslationsSection() {
  const { t } = useTranslation("settings")
  const catalog = useResourceStore((s) => s.catalog)
  const loading = useResourceStore((s) => s.loading)
  const error = useResourceStore((s) => s.error)
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [collapsedLanguages, setCollapsedLanguages] = useState<Set<string>>(
    () => new Set()
  )

  useEffect(() => {
    void useResourceStore.getState().loadCatalog()

    let active = true
    let dispose: (() => void) | undefined
    void useResourceStore
      .getState()
      .initProgress()
      .then((cleanup) => {
        if (active) dispose = cleanup
        else cleanup()
      })

    return () => {
      active = false
      dispose?.()
    }
  }, [])

  const groups = useMemo<TranslationGroup[]>(() => {
    const grouped = new Map<string, CatalogEntry[]>()

    for (const entry of catalog) {
      if (entry.resource.kind !== "bible" || entry.status === "byo-import") {
        continue
      }

      const language = languageLabel(entry.resource.language)
      const entries = grouped.get(language) ?? []
      entries.push(entry)
      grouped.set(language, entries)
    }

    return Array.from(grouped, ([language, entries]) => ({
      language,
      entries: entries.sort((a, b) =>
        alphabetical.compare(a.resource.title, b.resource.title)
      ),
    })).sort((a, b) => alphabetical.compare(a.language, b.language))
  }, [catalog])

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return groups

    return groups
      .map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          if (entry.resource.kind !== "bible") return false
          return [
            group.language,
            entry.resource.abbreviation,
            entry.resource.title,
          ].some((value) => value.toLowerCase().includes(normalizedQuery))
        }),
      }))
      .filter((group) => group.entries.length > 0)
  }, [groups, query])

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("bible.translations.title")}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {t("bible.translations.description")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportOpen(true)}
          title={t("bible.translations.importTitle")}
        >
          <Upload />
          {t("bible.translations.import")}
        </Button>
      </div>

      <ImportBibleDialog open={importOpen} onOpenChange={setImportOpen} />

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("bible.translations.searchPlaceholder")}
          aria-label={t("bible.translations.searchPlaceholder")}
          className="h-9 pl-9"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            onClick={() => useResourceStore.getState().clearError()}
          >
            {t("bible.translations.dismiss")}
          </Button>
        </div>
      )}

      {loading && groups.length === 0 ? (
        <EmptyState
          icon={<Loader2 className="animate-spin" />}
          title={t("bible.translations.loading")}
          live
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("bible.translations.empty")}
          description={t("bible.translations.emptyDescription")}
          live
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={t("bible.translations.noResults")}
          description={t("bible.translations.noResultsDescription")}
          live
        />
      ) : (
        <div className="flex flex-col">
          <p className="text-[0.625rem] font-medium tracking-wider text-muted-foreground/70 uppercase">
            {t("bible.translations.groupedBy")}
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {visibleGroups.map((group) => {
              const collapsed = collapsedLanguages.has(group.language)
              return (
                <div
                  key={group.language}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setCollapsedLanguages((current) => {
                        const next = new Set(current)
                        if (next.has(group.language))
                          next.delete(group.language)
                        else next.add(group.language)
                        return next
                      })
                    }
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {group.language}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t("bible.translations.count", {
                        count: group.entries.length,
                      })}
                      {collapsed ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronUp className="size-4" />
                      )}
                    </span>
                  </button>
                  {!collapsed && (
                    <div className="divide-y divide-border/70 border-t border-border px-4">
                      {group.entries.map((entry) => (
                        <BibleStoreCard key={entry.resource.id} entry={entry} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
