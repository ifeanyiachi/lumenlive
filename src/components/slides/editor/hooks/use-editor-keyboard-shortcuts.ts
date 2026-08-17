import { useEffect } from "react"

import { usePresentationStore } from "@/stores/presentation-store"

/**
 * Editor-global keyboard shortcuts: Delete/Backspace removes the selected
 * element, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes. Ignores
 * keystrokes originating in text inputs so typing in a field isn't hijacked.
 *
 * Store access goes through `getState()` inside the handler so the listener is
 * bound once (empty deps), never rebound per render.
 */
export function useEditorKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      const store = usePresentationStore.getState()

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        store.selectedElementId
      ) {
        e.preventDefault()
        store.removeElement(store.selectedElementId)
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        store.undo()
      }
      if (
        (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        store.redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
}
