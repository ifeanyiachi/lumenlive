import { useEffect } from "react"

/**
 * Suppresses the webview's built-in reload gestures — Ctrl/Cmd+R, Ctrl+Shift+R
 * (hard reload), and F5 — so an operator can't wipe live service state with a
 * stray keystroke mid-broadcast. Reloading is still possible on purpose via the
 * reload button in the transport bar.
 *
 * The listener runs in the capture phase and never bails on editable targets:
 * the reload gesture must be swallowed even while the operator is typing in a
 * search or edit field, which is exactly where an accidental Ctrl+R lands.
 */
export function useBlockReload() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isReloadCombo =
        ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) ||
        e.key === "F5"
      if (isReloadCombo) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [])
}
