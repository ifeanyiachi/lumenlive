const preventNativeContextMenu = (event: MouseEvent) => {
  event.preventDefault()
}

/**
 * Keep the webview's browser context menu out of the operator UI.
 *
 * The listener is capture-phase so embedded or deeply nested UI cannot stop it
 * before the native menu is suppressed. The event still bubbles normally, so a
 * future LumenLive context menu can listen and render its own actions.
 */
export function disableNativeContextMenu() {
  if (typeof document === "undefined") return
  document.addEventListener("contextmenu", preventNativeContextMenu, true)
}
