import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { VerseEdit } from "@/types/verse-edit"

interface VerseEditState {
  edits: Record<string, VerseEdit>
  goLiveEnabled: boolean

  saveEdit: (edit: VerseEdit) => void
  deleteEdit: (key: string) => void
  getEdit: (key: string) => VerseEdit | undefined
  hasEdit: (key: string) => boolean
  clearAllEdits: () => void
  setGoLiveEnabled: (enabled: boolean) => void

  getAllEdits: () => VerseEdit[]
  getEditCount: () => number
  searchEdits: (query: string) => VerseEdit[]
}

export const useVerseEditStore = create<VerseEditState>((set, get) => ({
  edits: {},
  goLiveEnabled: false,

  saveEdit: (edit) =>
    set((s) => ({
      edits: { ...s.edits, [edit.key]: { ...edit, updatedAt: Date.now() } },
    })),

  deleteEdit: (key) =>
    set((s) => {
      const { [key]: _, ...rest } = s.edits
      return { edits: rest }
    }),

  getEdit: (key) => get().edits[key],

  hasEdit: (key) => key in get().edits,

  clearAllEdits: () => set({ edits: {} }),

  setGoLiveEnabled: (goLiveEnabled) => set({ goLiveEnabled }),

  getAllEdits: () =>
    Object.values(get().edits).sort((a, b) => b.updatedAt - a.updatedAt),

  getEditCount: () => Object.keys(get().edits).length,

  searchEdits: (query) => {
    const q = query.toLowerCase()
    return get()
      .getAllEdits()
      .filter(
        (e) =>
          e.reference.toLowerCase().includes(q) ||
          e.originalText.toLowerCase().includes(q)
      )
  },
}))

// ── Persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getVerseEditStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("verse-edits.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateVerseEdits(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getVerseEditStore()
      const edits = (await store.get("edits")) as
        Record<string, VerseEdit> | undefined
      const goLive = (await store.get("goLiveEnabled")) as boolean | undefined

      const patch: Partial<VerseEditState> = {}
      if (edits && typeof edits === "object") {
        patch.edits = edits
      }
      if (typeof goLive === "boolean") {
        patch.goLiveEnabled = goLive
      }

      if (Object.keys(patch).length > 0) {
        useVerseEditStore.setState(patch)
      }

      useVerseEditStore.subscribe((state, prevState) => {
        if (
          state.edits !== prevState.edits ||
          state.goLiveEnabled !== prevState.goLiveEnabled
        ) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistVerseEdits(useVerseEditStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[verse-edits] Failed to load persisted verse edits, starting empty"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistVerseEdits(state: VerseEditState): Promise<void> {
  try {
    const store = await getVerseEditStore()
    await store.set("edits", state.edits)
    await store.set("goLiveEnabled", state.goLiveEnabled)
    await store.save()
  } catch {
    console.warn("[verse-edits] Failed to persist verse edits")
  }
}
