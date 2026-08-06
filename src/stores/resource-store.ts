import { create } from "zustand"
import * as resourceStore from "@/lib/resource-store"
import type { InstalledResource, CatalogEntry } from "@/types/resource-store"
import * as gateway from "@/services/resource-store-gateway"
import * as importGateway from "@/services/bible-import-gateway"
import type { ImportResult } from "@/services/bible-import-gateway"
import { listTranslationsDetailed } from "@/services/translation-gateway"
import {
  formatFromFileName,
  parseBibleFile,
  type ImportMetadata,
} from "@/lib/bible-import"
import { useBibleStore } from "./bible-store"

/**
 * Orchestrates the in-app resource store: loads the catalog (manifest diffed
 * against installed downloads), drives install/remove, and tracks per-item
 * progress. Real logic (manifest parsing, license gating, diffing) lives in
 * `lib/resource-store`; this store only sequences gateway calls and holds state.
 *
 * Progress and per-item state are keyed by resource id so a component can
 * subscribe to just its own entry (see `install-progress.tsx`) rather than the
 * whole map, which updates on every download chunk.
 */

type ItemState = "installing" | "removing"

interface ResourceStoreState {
  catalog: CatalogEntry[]
  /** Notes about manifest entries that were skipped, for surfacing in dev. */
  warnings: string[]
  loading: boolean
  error: string | null
  /** resource id -> in-flight operation. Absent when idle. */
  itemState: Record<string, ItemState | undefined>
  /** resource id -> download fraction in [0, 1]. */
  progress: Record<string, number>

  loadCatalog: () => Promise<void>
  install: (entry: CatalogEntry) => Promise<void>
  remove: (entry: CatalogEntry) => Promise<void>
  /**
   * Import a Bible into a new custom translation from an already-chosen file at
   * `path` (txt/csv/.bib parsed in-app; .sqlite read in Rust) and resolve to the
   * import summary. Rejects on a parse/build failure so the caller (the import
   * dialog) can show it inline — unlike install/remove, this does not route
   * errors to the page banner. The caller owns the file picker so it can prefill
   * metadata from the filename before importing.
   */
  importBible: (metadata: ImportMetadata, path: string) => Promise<ImportResult>
  /** Subscribe to backend progress events. Returns a disposer for unmount. */
  initProgress: () => Promise<() => void>
  clearError: () => void
}

/**
 * Bundled translations are those the Bible layer reports but that aren't
 * downloads. Match them to catalog entries (via the pure
 * `bundledInstalledRecords`) so they read as installed-and-non-removable.
 * Best-effort: if the translation list can't be read, downloads still resolve.
 */
async function bundledInstalls(
  manifest: Parameters<typeof resourceStore.bundledInstalledRecords>[0],
  downloaded: InstalledResource[]
): Promise<InstalledResource[]> {
  try {
    const downloadedRefIds = new Set(downloaded.map((d) => d.refId))
    const all = await listTranslationsDetailed()
    const bundledAbbrevs = all
      .filter((t) => !downloadedRefIds.has(t.id))
      .map((t) => t.abbreviation)
    return resourceStore.bundledInstalledRecords(manifest, bundledAbbrevs)
  } catch {
    console.warn("[store] Failed to read translations for bundled-marking")
    return []
  }
}

/** Reload the catalog and refresh the Bible picker after an install/remove. */
async function refreshAfterChange(): Promise<void> {
  await useResourceStore.getState().loadCatalog()
  try {
    const translations = await listTranslationsDetailed()
    useBibleStore.getState().setTranslations(translations)
  } catch {
    // A stale picker is recoverable; don't fail the whole operation for it.
    console.warn("[store] Failed to refresh translations after change")
  }
}

export const useResourceStore = create<ResourceStoreState>((set, get) => ({
  catalog: [],
  warnings: [],
  loading: false,
  error: null,
  itemState: {},
  progress: {},

  loadCatalog: async () => {
    set({ loading: true, error: null })
    try {
      const json = await gateway.fetchManifestJson()
      const { manifest, warnings } = resourceStore.parseManifest(
        JSON.parse(json)
      )
      // One registry read covers both downloads and imports.
      const records = await gateway.listInstalledTranslations()
      const installed = records.map(resourceStore.toInstalledResource)
      const bundled = await bundledInstalls(manifest, installed)
      set({
        // Manifest-matched entries first (bundled ahead of downloads so a
        // re-download wins the key collision in diffCatalog); then imported
        // translations, which have no manifest entry and are synthesized as
        // removable "installed" cards.
        catalog: [
          ...resourceStore.diffCatalog(manifest, [...bundled, ...installed]),
          ...resourceStore.importedCatalogEntries(records),
        ],
        warnings,
        loading: false,
      })
    } catch (err) {
      set({ error: String(err), loading: false })
    }
  },

  install: async (entry) => {
    const { resource } = entry
    if (resource.kind !== "bible") return
    const gate = resourceStore.canInstall(resource)
    if (!gate.ok) {
      set({ error: gate.reason ?? "This resource can't be installed." })
      return
    }
    set((s) => ({
      error: null,
      itemState: { ...s.itemState, [resource.id]: "installing" },
      progress: { ...s.progress, [resource.id]: 0 },
    }))
    try {
      await gateway.installBible(resource)
      await refreshAfterChange()
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set((s) => {
        const itemState = { ...s.itemState }
        const progress = { ...s.progress }
        delete itemState[resource.id]
        delete progress[resource.id]
        return { itemState, progress }
      })
    }
  },

  remove: async (entry) => {
    const refId = entry.installed?.refId
    if (refId == null) return
    const id = entry.resource.id
    set((s) => ({
      error: null,
      itemState: { ...s.itemState, [id]: "removing" },
    }))
    try {
      await gateway.removeBible(refId)
      await refreshAfterChange()
    } catch (err) {
      set({ error: String(err) })
    } finally {
      set((s) => {
        const itemState = { ...s.itemState }
        delete itemState[id]
        return { itemState }
      })
    }
  },

  importBible: async (metadata, path) => {
    const format = formatFromFileName(path)
    let result: ImportResult
    if (format === "sqlite") {
      result = await importGateway.importSqlite(metadata, path)
    } else if (format === "txt" || format === "csv" || format === "bib") {
      const content = await importGateway.readTextFile(path)
      const parsed = parseBibleFile(path, content)
      if (parsed.verses.length === 0) {
        throw new Error(
          parsed.warnings[0] ??
            "No verses could be read from this file. Check the format."
        )
      }
      result = await importGateway.importVerses(metadata, parsed.verses)
    } else if (format === "docx" || format === "pdf") {
      throw new Error(
        `${format.toUpperCase()} import isn't supported yet — export to .txt, .csv, or .bib and try again.`
      )
    } else {
      throw new Error("Unsupported file type for Bible import.")
    }

    await refreshAfterChange()
    return result
  },

  initProgress: () =>
    gateway.onInstallProgress(({ resourceId, received, total }) => {
      const fraction = total > 0 ? Math.min(1, received / total) : 0
      // Only track ids we're actively installing, so a late event can't
      // resurrect a cleared bar.
      if (get().itemState[resourceId] !== "installing") return
      set((s) => ({ progress: { ...s.progress, [resourceId]: fraction } }))
    }),

  clearError: () => set({ error: null }),
}))
