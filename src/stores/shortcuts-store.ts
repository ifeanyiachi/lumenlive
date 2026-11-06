import { create } from "zustand"

/**
 * Open state for the keyboard-shortcuts cheat-sheet overlay. Lifted into its own
 * store so both the `?` global shortcut and the transport-bar button can toggle
 * the single overlay instance mounted at the app root.
 */
interface ShortcutsState {
  overlayOpen: boolean
  setOverlayOpen: (open: boolean) => void
  toggleOverlay: () => void
}

export const useShortcutsStore = create<ShortcutsState>((set) => ({
  overlayOpen: false,
  setOverlayOpen: (overlayOpen) => set({ overlayOpen }),
  toggleOverlay: () => set((s) => ({ overlayOpen: !s.overlayOpen })),
}))
