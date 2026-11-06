import { create } from "zustand"

export type AppView = "live" | "slide" | "media" | "song" | "youtube" | "store"

interface AppState {
  view: AppView
  setView: (view: AppView) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: "live",
  setView: (view) => set({ view }),
}))
