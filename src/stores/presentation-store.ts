import { create } from "zustand"
import {
  loadStoredPresentations,
  loadLegacySlidePresentations,
  savePresentations,
} from "@/lib/presentation/persistence"
import type { PresentationState } from "./presentation/types"
import { createLibrarySlice } from "./presentation/library"
import { createLifecycleSlice } from "./presentation/lifecycle"
import { createSlidesSlice } from "./presentation/slides"
import { createElementsSlice } from "./presentation/elements"
import { createHistorySlice } from "./presentation/history"

// The store state/action interface, the undo/redo machinery, and the domain
// slices now live under `./presentation/*`. Re-exported here so existing
// `@/stores/presentation-store` imports keep resolving.
export type { PresentationState }

/**
 * The presentation (slide deck) store, composed from domain slices under
 * `stores/presentation/`. Every slice shares the same `set`/`get` over the full
 * {@link PresentationState}, so cross-slice calls and cross-slice state writes
 * (e.g. a slide op updating `selectedElementId`, or `deletePresentation`
 * clearing the draft) resolve at runtime exactly as they did when this was one
 * monolithic store. The shared undo history lives in `presentation/internals`.
 */
export const usePresentationStore = create<PresentationState>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createLifecycleSlice(...a),
  ...createSlidesSlice(...a),
  ...createElementsSlice(...a),
  ...createHistorySlice(...a),
}))

// ── Persistence wiring ──
// All plugin-store I/O lives in src/lib/presentation/persistence.ts; this just
// bridges load → state on startup and state → save (debounced) thereafter.

let hydrationPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

export function hydratePresentations(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const stored = await loadStoredPresentations()
      if (stored) usePresentationStore.setState({ presentations: stored })

      const legacy = await loadLegacySlidePresentations()
      if (legacy) {
        usePresentationStore.setState((s) => ({
          presentations: [...s.presentations, ...legacy],
        }))
      }
    } catch {
      console.warn(
        "[presentations] Failed to load persisted presentations, starting empty"
      )
    }

    // Register autosave regardless of load outcome: a load failure must not
    // leave the session silently without persistence for the user's new work.
    usePresentationStore.subscribe((state, prevState) => {
      if (state.presentations !== prevState.presentations) {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          pendingSave = pendingSave.then(() =>
            savePresentations(usePresentationStore.getState().presentations)
          )
        }, SAVE_DEBOUNCE_MS)
      }
    })
  })()
  return hydrationPromise
}
