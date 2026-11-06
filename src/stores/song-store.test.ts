import { beforeEach, describe, expect, it, vi } from "vitest"

// Persistence is exercised elsewhere; here we only need the store logic, so
// the tauri plugin is stubbed out (hydrateSongStore is never called).
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(),
}))

import { useSongStore } from "./song-store"
import { createDefaultSong, type Song } from "@/types/song"

function librarySong(title = "In the Library"): Song {
  return { ...createDefaultSong(title), id: `song-${title}` }
}

/**
 * Draft-based editing (no autosave): edits target `editingDraft` and reach the
 * library only via saveEdit; cancelEdit discards them, and a brand-new song
 * never enters the library unless saved.
 */
describe("song store draft editing", () => {
  beforeEach(() => {
    useSongStore.setState({
      songs: [],
      songUsage: [],
      searchQuery: "",
      selectedSongId: null,
      editingSongId: null,
      editingDraft: null,
      importProgress: null,
    })
  })

  it("openEditor clones the song into a draft; edits do not touch the library until save", () => {
    const song = librarySong()
    useSongStore.setState({ songs: [song] })
    const store = useSongStore.getState()

    store.openEditor(song.id)
    expect(useSongStore.getState().editingDraft?.id).toBe(song.id)
    expect(useSongStore.getState().editingDraft).not.toBe(song)

    store.updateSong(song.id, { title: "Renamed" })
    expect(useSongStore.getState().songs[0].title).toBe("In the Library")
    expect(useSongStore.getState().editingDraft?.title).toBe("Renamed")

    useSongStore.getState().saveEdit()
    const after = useSongStore.getState()
    expect(after.songs[0].title).toBe("Renamed")
    expect(after.editingDraft).toBeNull()
    expect(after.editingSongId).toBeNull()
    expect(after.selectedSongId).toBe(song.id)
  })

  it("cancelEdit discards draft changes", () => {
    const song = librarySong()
    useSongStore.setState({ songs: [song] })
    const store = useSongStore.getState()

    store.openEditor(song.id)
    store.updateSong(song.id, { title: "Should not stick" })
    useSongStore.getState().cancelEdit()

    const after = useSongStore.getState()
    expect(after.songs[0].title).toBe("In the Library")
    expect(after.editingDraft).toBeNull()
    expect(after.editingSongId).toBeNull()
  })

  it("openNewSongEditor keeps the new song out of the library until saved", () => {
    useSongStore.getState().openNewSongEditor()
    let state = useSongStore.getState()
    expect(state.songs).toHaveLength(0)
    expect(state.editingDraft).not.toBeNull()
    expect(state.editingSongId).toBe(state.editingDraft!.id)

    // Abandoning it leaves no stray draft in the library.
    state.cancelEdit()
    expect(useSongStore.getState().songs).toHaveLength(0)

    // Saving it commits and selects it.
    useSongStore.getState().openNewSongEditor()
    useSongStore.getState().saveEdit()
    state = useSongStore.getState()
    expect(state.songs).toHaveLength(1)
    expect(state.selectedSongId).toBe(state.songs[0].id)
  })

  it("section mutations apply to the draft while one is open, and to the library otherwise", () => {
    const song = librarySong()
    useSongStore.setState({ songs: [song] })
    const store = useSongStore.getState()

    store.beginEdit(song.id)
    useSongStore.getState().addSection(song.id, "chorus")
    expect(useSongStore.getState().songs[0].sections).toHaveLength(1)
    expect(useSongStore.getState().editingDraft?.sections).toHaveLength(2)

    useSongStore.getState().cancelEdit()
    useSongStore.getState().addSection(song.id, "chorus")
    expect(useSongStore.getState().songs[0].sections).toHaveLength(2)
  })

  it("removeSong clears a matching draft", () => {
    const song = librarySong()
    useSongStore.setState({ songs: [song] })
    useSongStore.getState().openEditor(song.id)
    useSongStore.getState().removeSong(song.id)

    const after = useSongStore.getState()
    expect(after.songs).toHaveLength(0)
    expect(after.editingDraft).toBeNull()
    expect(after.editingSongId).toBeNull()
  })

  it("openEditor on an unknown id is a no-op", () => {
    useSongStore.getState().openEditor("missing")
    const state = useSongStore.getState()
    expect(state.editingDraft).toBeNull()
    expect(state.editingSongId).toBeNull()
  })
})
