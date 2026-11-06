import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import {
  createDefaultSong,
  type Song,
  type SongSectionType,
  type SongUsageEntry,
} from "@/types/song"
import { searchSongs } from "@/lib/song/song-search"
import * as mutations from "@/lib/song/song-mutations"

interface SongState {
  songs: Song[]
  /** CCLI usage log — one entry per go-live, for the usage report. */
  songUsage: SongUsageEntry[]
  searchQuery: string
  selectedSongId: string | null
  /** The song open in the full-screen lyric editor, or null when it is closed. */
  editingSongId: string | null
  /**
   * The working copy for the current edit session (full-screen editor or the
   * detail pane's inline lyrics edit). While a draft exists, every song
   * mutation targeting its id applies to the draft instead of the library —
   * nothing is committed (or persisted) until `saveEdit`, and `cancelEdit`
   * throws the draft away. A brand-new song lives *only* here until saved, so
   * abandoning it leaves no stray "Untitled Song" in the library.
   */
  editingDraft: Song | null
  /** Transient progress for a bulk (folder/pack) import, or null when idle. */
  importProgress: { current: number; total: number; label?: string } | null

  addSong: (song: Song) => void
  addSongs: (songs: Song[]) => void // batch import (Phase 4)
  removeSong: (id: string) => void
  /**
   * Remove every song tagged with `batchId` (see `Song.importBatchId`) — the
   * one-click uninstall for a community pack installed from the Store. Returns
   * the number of songs removed (0 if none matched).
   */
  removeSongsByBatch: (batchId: string) => number
  updateSong: (id: string, updates: Partial<Song>) => void
  duplicateSong: (id: string) => Song | null
  setSearchQuery: (query: string) => void
  setSelectedSong: (id: string | null) => void
  /** Start editing a library song in place (inline lyrics edit) — clones it into `editingDraft`. */
  beginEdit: (id: string) => void
  /** Open the full-screen editor on a library song (clones it into a draft). */
  openEditor: (id: string) => void
  /** Open the full-screen editor on a brand-new song that is NOT yet in the library. */
  openNewSongEditor: () => void
  /** Commit the draft to the library (adding it if new), select it, and end the session. */
  saveEdit: () => void
  /** Discard the draft without committing and end the session. */
  cancelEdit: () => void
  setImportProgress: (progress: SongState["importProgress"]) => void
  /** Append a usage entry (called when a song goes live) for the CCLI report. */
  recordSongUsage: (song: Song, serviceName?: string) => void
  /** Songs matching the current search query (Fuse over title/author/lyrics). */
  filteredSongs: () => Song[]

  // Section / arrangement edits — delegate to pure `lib/song/song-mutations`.
  addSection: (songId: string, type?: SongSectionType) => void
  updateSection: (
    songId: string,
    sectionId: string,
    updates: Partial<Omit<Song["sections"][number], "id">>
  ) => void
  removeSection: (songId: string, sectionId: string) => void
  reorderSection: (songId: string, from: number, to: number) => void
  addArrangement: (songId: string, name?: string) => void
  updateArrangement: (
    songId: string,
    arrangementId: string,
    updates: { name?: string; sectionIds?: string[] }
  ) => void
  removeArrangement: (songId: string, arrangementId: string) => void
  setDefaultArrangement: (songId: string, arrangementId: string) => void
  addSectionToArrangement: (
    songId: string,
    arrangementId: string,
    sectionId: string
  ) => void
  removeArrangementSlot: (
    songId: string,
    arrangementId: string,
    slotIndex: number
  ) => void
  reorderArrangementSlot: (
    songId: string,
    arrangementId: string,
    from: number,
    to: number
  ) => void
}

export const useSongStore = create<SongState>((set, get) => {
  /**
   * Apply a pure `song-mutations` transform to one song by id. While that song
   * is open as a draft, the transform hits the draft instead of the library so
   * edits stay uncommitted until an explicit save.
   */
  const applyMutation = (songId: string, fn: (song: Song) => Song) =>
    set((state) =>
      state.editingDraft?.id === songId
        ? { editingDraft: fn(state.editingDraft) }
        : { songs: state.songs.map((s) => (s.id === songId ? fn(s) : s)) }
    )

  return {
    songs: [],
    songUsage: [],
    searchQuery: "",
    selectedSongId: null,
    editingSongId: null,
    editingDraft: null,
    importProgress: null,

    addSong: (song) => set((state) => ({ songs: [...state.songs, song] })),

    addSongs: (newSongs) =>
      set((state) => ({ songs: [...state.songs, ...newSongs] })),

    removeSong: (id) =>
      set((state) => ({
        songs: state.songs.filter((s) => s.id !== id),
        selectedSongId:
          state.selectedSongId === id ? null : state.selectedSongId,
        editingSongId: state.editingSongId === id ? null : state.editingSongId,
        editingDraft: state.editingDraft?.id === id ? null : state.editingDraft,
      })),

    removeSongsByBatch: (batchId) => {
      const removedIds = new Set(
        get()
          .songs.filter((s) => s.importBatchId === batchId)
          .map((s) => s.id)
      )
      if (removedIds.size === 0) return 0
      set((state) => ({
        songs: state.songs.filter((s) => !removedIds.has(s.id)),
        selectedSongId:
          state.selectedSongId && removedIds.has(state.selectedSongId)
            ? null
            : state.selectedSongId,
        editingSongId:
          state.editingSongId && removedIds.has(state.editingSongId)
            ? null
            : state.editingSongId,
        editingDraft:
          state.editingDraft && removedIds.has(state.editingDraft.id)
            ? null
            : state.editingDraft,
      }))
      return removedIds.size
    },

    updateSong: (id, updates) =>
      set((state) =>
        state.editingDraft?.id === id
          ? {
              editingDraft: {
                ...state.editingDraft,
                ...updates,
                updatedAt: Date.now(),
              },
            }
          : {
              songs: state.songs.map((s) =>
                s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
              ),
            }
      ),

    duplicateSong: (id) => {
      const source = get().songs.find((s) => s.id === id)
      if (!source) return null
      const now = Date.now()
      // Deep clone so the copy shares no section/arrangement references, then
      // re-key every embedded id so the two songs are fully independent.
      const clone: Song = structuredClone(source)
      const sectionIdMap = new Map<string, string>()
      clone.sections = clone.sections.map((section) => {
        const newId = crypto.randomUUID()
        sectionIdMap.set(section.id, newId)
        return { ...section, id: newId }
      })
      clone.arrangements = clone.arrangements.map((arr) => ({
        ...arr,
        id: crypto.randomUUID(),
        sectionIds: arr.sectionIds.map((sid) => sectionIdMap.get(sid) ?? sid),
      }))
      clone.id = crypto.randomUUID()
      clone.title = `${source.title} (Copy)`
      clone.createdAt = now
      clone.updatedAt = now
      set((state) => ({
        songs: [...state.songs, clone],
        selectedSongId: clone.id,
      }))
      return clone
    },

    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSelectedSong: (selectedSongId) => set({ selectedSongId }),

    beginEdit: (id) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === id)
        // Deep clone: the draft must share no nested section/arrangement
        // references with the library copy, or edits would leak through.
        return song ? { editingDraft: structuredClone(song) } : {}
      }),

    openEditor: (id) => {
      get().beginEdit(id)
      // Only enter editor mode if the clone succeeded (the id resolved).
      if (get().editingDraft?.id === id) {
        set({ editingSongId: id, selectedSongId: id })
      }
    },

    openNewSongEditor: () => {
      const song = createDefaultSong()
      // Deliberately NOT added to `songs`: an abandoned new song vanishes on
      // cancel instead of lingering in the library as an untitled draft.
      set({ editingDraft: song, editingSongId: song.id })
    },

    saveEdit: () =>
      set((state) => {
        const draft = state.editingDraft
        if (!draft) return { editingSongId: null }
        const exists = state.songs.some((s) => s.id === draft.id)
        return {
          songs: exists
            ? state.songs.map((s) => (s.id === draft.id ? draft : s))
            : [...state.songs, draft],
          selectedSongId: draft.id,
          editingDraft: null,
          editingSongId: null,
        }
      }),

    cancelEdit: () => set({ editingDraft: null, editingSongId: null }),
    setImportProgress: (importProgress) => set({ importProgress }),

    recordSongUsage: (song, serviceName) =>
      set((state) => ({
        songUsage: [
          ...state.songUsage,
          {
            id: crypto.randomUUID(),
            songId: song.id,
            cachedTitle: song.title,
            cachedCcliNumber: song.ccliNumber,
            usedAt: Date.now(),
            serviceName,
          },
        ],
      })),

    filteredSongs: () => {
      const { songs, searchQuery } = get()
      return searchSongs(songs, searchQuery)
    },

    addSection: (songId, type) =>
      applyMutation(songId, (s) => mutations.addSection(s, type)),
    updateSection: (songId, sectionId, updates) =>
      applyMutation(songId, (s) =>
        mutations.updateSection(s, sectionId, updates)
      ),
    removeSection: (songId, sectionId) =>
      applyMutation(songId, (s) => mutations.removeSection(s, sectionId)),
    reorderSection: (songId, from, to) =>
      applyMutation(songId, (s) => mutations.reorderSection(s, from, to)),

    addArrangement: (songId, name) =>
      applyMutation(songId, (s) => mutations.addArrangement(s, name)),
    updateArrangement: (songId, arrangementId, updates) =>
      applyMutation(songId, (s) =>
        mutations.updateArrangement(s, arrangementId, updates)
      ),
    removeArrangement: (songId, arrangementId) =>
      applyMutation(songId, (s) =>
        mutations.removeArrangement(s, arrangementId)
      ),
    setDefaultArrangement: (songId, arrangementId) =>
      applyMutation(songId, (s) =>
        mutations.setDefaultArrangement(s, arrangementId)
      ),
    addSectionToArrangement: (songId, arrangementId, sectionId) =>
      applyMutation(songId, (s) =>
        mutations.addSectionToArrangement(s, arrangementId, sectionId)
      ),
    removeArrangementSlot: (songId, arrangementId, slotIndex) =>
      applyMutation(songId, (s) =>
        mutations.removeArrangementSlot(s, arrangementId, slotIndex)
      ),
    reorderArrangementSlot: (songId, arrangementId, from, to) =>
      applyMutation(songId, (s) =>
        mutations.reorderArrangementSlot(s, arrangementId, from, to)
      ),
  }
})

// ── Persistence via tauri-plugin-store (mirrors media-store.ts) ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getSongStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("song-library.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateSongStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getSongStore()
      const songs = (await store.get("songs")) as Song[] | undefined
      const songUsage = (await store.get("songUsage")) as
        SongUsageEntry[] | undefined

      const hydrated: Partial<SongState> = {}
      if (songs && Array.isArray(songs) && songs.length > 0)
        hydrated.songs = songs
      if (songUsage && Array.isArray(songUsage)) hydrated.songUsage = songUsage
      if (Object.keys(hydrated).length > 0) {
        useSongStore.setState(hydrated)
      }

      useSongStore.subscribe((state, prevState) => {
        if (
          state.songs !== prevState.songs ||
          state.songUsage !== prevState.songUsage
        ) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistSongState(useSongStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[song] Failed to load persisted song library, starting empty"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistSongState(state: SongState): Promise<void> {
  try {
    const store = await getSongStore()
    await store.set("songs", state.songs)
    await store.set("songUsage", state.songUsage)
    await store.save()
  } catch {
    console.warn("[song] Failed to persist song library")
  }
}
