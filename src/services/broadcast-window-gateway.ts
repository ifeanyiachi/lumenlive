import { invoke } from "@tauri-apps/api/core"
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event"
import {
  availableMonitors,
  getAllWindows,
  type Monitor,
} from "@tauri-apps/api/window"
import { outputWindowLabel } from "@/lib/broadcast-routing"
import { BROADCAST_EVENTS } from "@/services/broadcast-content-gateway"

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

/**
 * Bring the broadcast output window back to the front on its monitor.
 *
 * The projector is a shared display: the operator can move another app (a
 * browser video, a Chrome page) over the output mid-service, then return to
 * Lumen. The output is hidden from the taskbar/alt-tab, so this is the only
 * handle to raise it again. Fire-and-forget from the UI.
 */
export function focusBroadcastWindow(outputId: string): Promise<unknown> {
  return invoke("focus_broadcast_window", { outputId })
}

/** Ask an already-mounted output window to re-announce readiness. */
export function requestOutputResync(outputId: string): Promise<unknown> {
  return emitTo(outputWindowLabel(outputId), BROADCAST_EVENTS.requestResync)
}

/** Subscribe to the "an output window is ready" event. */
export function onOutputReady(handler: () => void): Promise<UnlistenFn> {
  return listen(BROADCAST_EVENTS.outputReady, handler)
}

/** Payload of {@link onOutputDisplayDisconnected}. */
export interface OutputDisplayDisconnected {
  outputId: string
  /** True when NDI is still sending: the projector is gone but the feed isn't. */
  ndiActive: boolean
}

/**
 * Subscribe to "a broadcast output's physical display was unplugged". The backend
 * keeps the output *enabled* and holds its window hidden (it is not torn down), so
 * the control UI just informs the operator and shows a "reconnecting" state — the
 * output resumes automatically on {@link onOutputDisplayConnected}.
 */
export function onOutputDisplayDisconnected(
  handler: (payload: OutputDisplayDisconnected) => void
): Promise<UnlistenFn> {
  return listen<OutputDisplayDisconnected>(
    "output_display_disconnected",
    (e) => handler(e.payload)
  )
}

/** Payload of {@link onOutputDisplayConnected}. */
export interface OutputDisplayConnected {
  outputId: string
}

/**
 * Subscribe to "a previously-unplugged broadcast display came back". The backend
 * has already re-shown the output window on the reattached monitor; this lets the
 * control UI clear its "reconnecting" state and re-push current content so the
 * projector paints immediately.
 */
export function onOutputDisplayConnected(
  handler: (payload: OutputDisplayConnected) => void
): Promise<UnlistenFn> {
  return listen<OutputDisplayConnected>("output_display_connected", (e) =>
    handler(e.payload)
  )
}

/** Whether the output window for `outputId` is currently open. */
export async function isBroadcastWindowOpen(
  outputId: string
): Promise<boolean> {
  const windows = await getAllWindows()
  return windows.some((w) => w.label === outputWindowLabel(outputId))
}

/**
 * Whether ANY broadcast output window is currently open. Output windows are
 * labelled `broadcast` (main) or `broadcast-<id>`, never overlapping the control
 * window — so this reliably answers "is a broadcast on-screen right now?". Used at
 * boot to tell a mid-broadcast control-panel reload (windows still open, resume
 * the live session) from a cold launch (no windows, start clean).
 */
export async function anyBroadcastWindowOpen(): Promise<boolean> {
  const windows = await getAllWindows()
  return windows.some(
    (w) => w.label === "broadcast" || w.label.startsWith("broadcast-")
  )
}

/** Enumerate the connected monitors. */
export async function listMonitors(): Promise<Monitor[]> {
  return availableMonitors()
}
