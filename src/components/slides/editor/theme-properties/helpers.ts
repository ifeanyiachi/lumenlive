import { usePresentationStore } from "@/stores/presentation-store"
import type { SlideElement } from "@/types/slide"

/**
 * Patch a placeholder element on the draft slide by id (themeredo.md, Phase 3).
 * Read via `getState()` so a control never re-binds the store on every render.
 */
export function patchElement(id: string, updates: Partial<SlideElement>) {
  usePresentationStore.getState().updateDraftElement(id, updates)
}
