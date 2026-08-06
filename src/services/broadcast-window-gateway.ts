import { invoke } from "@tauri-apps/api/core"
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event"
import {
  availableMonitors,
  getAllWindows,
  type Monitor,
} from "@tauri-apps/api/window"
import { outputWindowLabel } from "@/lib/broadcast-routing"

/**
 * Gateway for the broadcast output *windows*: their lifecycle, discovery, and
 * the low-level resync signal. Every Tauri `invoke`/`emitTo`/`listen` and window
 * enumeration for output windows lives here, so UI code expresses intent
 * ("open the main preview") without knowing backend command names or event
 * strings. That keeps the settings UI free of Tauri APIs and makes this surface
 * mockable in tests.
 *
 * Callers decide how to handle rejections (some paths `await`, others fire and
 * forget with `.catch`), so these methods simply return the underlying promise.
 */

export type { Monitor }

/** Open a broadcast output window on the given monitor (optionally in stage mode). */
export function openBroadcastWindow(
  outputId: string,
  monitorIndex: number,
  mode?: "stage"
): Promise<unknown> {
  return invoke("open_broadcast_window", { outputId, monitorIndex, mode })
}

/** Ensure a broadcast output window exists (creating it hidden if needed). */
export function ensureBroadcastWindow(
  outputId: string,
  mode?: "stage"
): Promise<unknown> {
  return invoke("ensure_broadcast_window", { outputId, mode })
}

/** Close a broadcast output window. */
export function closeBroadcastWindow(outputId: string): Promise<unknown> {
  return invoke("close_broadcast_window", { outputId })
}

/** Ask an already-mounted output window to re-announce readiness. */
export function requestOutputResync(outputId: string): Promise<unknown> {
  return emitTo(outputWindowLabel(outputId), "broadcast:request-resync")
}

/** Subscribe to the "an output window is ready" event. */
export function onOutputReady(handler: () => void): Promise<UnlistenFn> {
  return listen("broadcast:output-ready", handler)
}

/** Whether the output window for `outputId` is currently open. */
export async function isBroadcastWindowOpen(
  outputId: string
): Promise<boolean> {
  const windows = await getAllWindows()
  return windows.some((w) => w.label === outputWindowLabel(outputId))
}

/** Enumerate the connected monitors. */
export function listMonitors(): Promise<Monitor[]> {
  return availableMonitors()
}
