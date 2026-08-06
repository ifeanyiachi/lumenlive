import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { Collection, MediaAsset, MediaType } from "@/types/media"

/**
 * Best-effort delete of app-managed copies from the media library folder.
 * Referenced (non-managed) assets are ignored so originals are never touched.
 * Failures are swallowed — a missing file is not worth surfacing on removal.
 */
function deleteManagedFiles(assets: MediaAsset[]): void {
  const managed = assets.filter((a) => a.managed && a.filePath)
  if (managed.length === 0) return
  void (async () => {
    try {
      const { remove } = await import("@tauri-apps/plugin-fs")
      await Promise.all(
        managed.map((a) =>
          remove(a.filePath).catch(() => {
            /* already gone */
          })
        )
      )
    } catch {
      /* fs plugin unavailable (e.g. browser) — nothing to clean up */
    }
  })()
}

interface ImportProgress {
  current: number
  total: number
}

interface MediaState {
  assets: MediaAsset[]
  collections: Collection[]
  filter: MediaType | "all"
  searchQuery: string
  selectedAssetId: string | null
  activeCollectionId: string | null
  checkedIds: Set<string>
  importProgress: ImportProgress | null

  addAssets: (assets: MediaAsset[]) => void
  removeAsset: (id: string) => void
  removeAssets: (ids: Set<string>) => void
  updateAsset: (id: string, updates: Partial<MediaAsset>) => void
  setFilter: (filter: MediaType | "all") => void
  setSearchQuery: (query: string) => void
  setSelectedAsset: (id: string | null) => void
  toggleChecked: (id: string) => void
  clearChecked: () => void
  setImportProgress: (progress: ImportProgress | null) => void
  filteredAssets: () => MediaAsset[]

  createCollection: (name: string) => Collection
  renameCollection: (id: string, name: string) => void
  deleteCollection: (id: string) => void
  addAssetsToCollection: (collectionId: string, assetIds: string[]) => void
  removeAssetFromCollection: (collectionId: string, assetId: string) => void
  setActiveCollection: (id: string | null) => void
}

export const useMediaStore = create<MediaState>((set, get) => ({
  assets: [],
  collections: [],
  filter: "all",
  searchQuery: "",
  selectedAssetId: null,
  activeCollectionId: null,
  checkedIds: new Set(),
  importProgress: null,

  addAssets: (newAssets) =>
    set((state) => ({ assets: [...state.assets, ...newAssets] })),

  removeAsset: (id) =>
    set((state) => {
      const removed = state.assets.filter((a) => a.id === id)
      deleteManagedFiles(removed)
      return {
        assets: state.assets.filter((a) => a.id !== id),
        selectedAssetId:
          state.selectedAssetId === id ? null : state.selectedAssetId,
        collections: state.collections.map((c) =>
          c.assetIds.includes(id)
            ? { ...c, assetIds: c.assetIds.filter((aid) => aid !== id) }
            : c
        ),
      }
    }),

  removeAssets: (ids) =>
    set((state) => {
      deleteManagedFiles(state.assets.filter((a) => ids.has(a.id)))
      return {
        assets: state.assets.filter((a) => !ids.has(a.id)),
        selectedAssetId: ids.has(state.selectedAssetId ?? "")
          ? null
          : state.selectedAssetId,
        checkedIds: new Set(),
        collections: state.collections.map((c) => {
          const filtered = c.assetIds.filter((aid) => !ids.has(aid))
          return filtered.length !== c.assetIds.length
            ? { ...c, assetIds: filtered }
            : c
        }),
      }
    }),

  updateAsset: (id, updates) =>
    set((state) => ({
      assets: state.assets.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  setFilter: (filter) => set({ filter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedAsset: (selectedAssetId) => set({ selectedAssetId }),

  toggleChecked: (id) =>
    set((state) => {
      const next = new Set(state.checkedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { checkedIds: next }
    }),

  clearChecked: () => set({ checkedIds: new Set() }),

  setImportProgress: (importProgress) => set({ importProgress }),

  filteredAssets: () => {
    const { assets, filter, searchQuery, activeCollectionId, collections } =
      get()
    let filtered = assets
    if (filter !== "all") {
      filtered = filtered.filter((a) => a.type === filter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    if (activeCollectionId) {
      const collection = collections.find((c) => c.id === activeCollectionId)
      if (collection) {
        const idSet = new Set(collection.assetIds)
        filtered = filtered.filter((a) => idSet.has(a.id))
      }
    }
    return filtered
  },

  createCollection: (name) => {
    const collection: Collection = {
      id: crypto.randomUUID(),
      name: name.trim(),
      assetIds: [],
      createdAt: Date.now(),
    }
    set((state) => ({ collections: [...state.collections, collection] }))
    return collection
  },

  renameCollection: (id, name) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, name: name.trim() } : c
      ),
    })),

  deleteCollection: (id) =>
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      activeCollectionId:
        state.activeCollectionId === id ? null : state.activeCollectionId,
    })),

  addAssetsToCollection: (collectionId, assetIds) =>
    set((state) => ({
      collections: state.collections.map((c) => {
        if (c.id !== collectionId) return c
        const merged = new Set(c.assetIds)
        for (const id of assetIds) merged.add(id)
        return { ...c, assetIds: [...merged] }
      }),
    })),

  removeAssetFromCollection: (collectionId, assetId) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === collectionId
          ? { ...c, assetIds: c.assetIds.filter((id) => id !== assetId) }
          : c
      ),
    })),

  setActiveCollection: (activeCollectionId) => set({ activeCollectionId }),
}))

// ── Persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getMediaStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("media-library.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateMediaStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getMediaStore()
      const assets = (await store.get("assets")) as MediaAsset[] | undefined
      const collections = (await store.get("collections")) as
        Collection[] | undefined

      const hydrated: Partial<MediaState> = {}
      if (assets && Array.isArray(assets) && assets.length > 0) {
        hydrated.assets = assets
      }
      if (collections && Array.isArray(collections)) {
        hydrated.collections = collections
      }
      if (Object.keys(hydrated).length > 0) {
        useMediaStore.setState(hydrated)
      }

      useMediaStore.subscribe((state, prevState) => {
        if (
          state.assets !== prevState.assets ||
          state.collections !== prevState.collections
        ) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistMediaState(useMediaStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[media] Failed to load persisted media library, starting empty"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistMediaState(state: MediaState): Promise<void> {
  try {
    const store = await getMediaStore()
    const stripped = state.assets.map(({ thumbnailDataUrl, ...rest }) => rest)
    await store.set("assets", stripped)
    await store.set("collections", state.collections)
    await store.save()
  } catch {
    console.warn("[media] Failed to persist media library")
  }
}
