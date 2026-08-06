import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"

export interface WebBookmark {
  id: string
  url: string
  label: string
  isYouTube: boolean
  videoId?: string
  createdAt: number
}

interface WebState {
  bookmarks: WebBookmark[]
  currentUrl: string
  history: string[]
  historyIndex: number

  navigate: (url: string) => void
  goBack: () => void
  goForward: () => void
  addBookmark: (
    url: string,
    label: string,
    isYouTube?: boolean,
    videoId?: string
  ) => void
  removeBookmark: (id: string) => void
  updateBookmark: (id: string, updates: Partial<WebBookmark>) => void
}

export const useWebStore = create<WebState>((set, get) => ({
  bookmarks: [],
  currentUrl: "",
  history: [],
  historyIndex: -1,

  navigate: (url) => {
    const { history, historyIndex } = get()
    const trimmed = history.slice(0, historyIndex + 1)
    set({
      currentUrl: url,
      history: [...trimmed, url],
      historyIndex: trimmed.length,
    })
  },

  goBack: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    set({ historyIndex: newIndex, currentUrl: history[newIndex] })
  },

  goForward: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    set({ historyIndex: newIndex, currentUrl: history[newIndex] })
  },

  addBookmark: (url, label, isYouTube = false, videoId) => {
    const bookmark: WebBookmark = {
      id: crypto.randomUUID(),
      url,
      label,
      isYouTube,
      videoId,
      createdAt: Date.now(),
    }
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }))
  },

  removeBookmark: (id) => {
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }))
  },

  updateBookmark: (id, updates) => {
    set((s) => ({
      bookmarks: s.bookmarks.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    }))
  },
}))

// ── Persistence ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getWebStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("web-bookmarks.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateWebBookmarks(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getWebStore()
      const bookmarks = (await store.get("bookmarks")) as
        WebBookmark[] | undefined
      if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
        useWebStore.setState({ bookmarks })
      }

      useWebStore.subscribe((state, prevState) => {
        if (state.bookmarks !== prevState.bookmarks) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistBookmarks(useWebStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn("[web] Failed to load persisted bookmarks")
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistBookmarks(state: WebState): Promise<void> {
  try {
    const store = await getWebStore()
    await store.set("bookmarks", state.bookmarks)
    await store.save()
  } catch {
    console.warn("[web] Failed to persist bookmarks")
  }
}
