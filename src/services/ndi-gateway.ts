import { invoke } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import { outputWindowLabel } from "@/lib/broadcast-routing"
import { BROADCAST_EVENTS } from "@/services/broadcast-content-gateway"
import type {
  NdiConfigEventPayload,
  NdiSessionInfo,
  NdiStartRequest,
} from "@/types"

/**
 * Gateway for NDI broadcasting. Wraps the `start_ndi`/`stop_ndi` backend
 * commands and the `broadcast:ndi-config` window event so UI code never touches
 * Tauri `invoke`/`emitTo` directly for NDI.
 */

/** Start an NDI sender for `outputId`, returning the negotiated session info. */
export function startNdi(
  outputId: string,
  request: NdiStartRequest
): Promise<NdiSessionInfo> {
  return invoke<NdiSessionInfo>("start_ndi", { outputId, request })
}

/** Stop the NDI sender for `outputId`. */
export function stopNdi(outputId: string): Promise<unknown> {
  return invoke("stop_ndi", { outputId })
}

/** Push the current NDI config to an output window (drives its capture pipeline). */
export function emitNdiConfig(
  outputId: string,
  config: NdiConfigEventPayload
): Promise<unknown> {
  return emitTo(outputWindowLabel(outputId), BROADCAST_EVENTS.ndiConfig, config)
}
