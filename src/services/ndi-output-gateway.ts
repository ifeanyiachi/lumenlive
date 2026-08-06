import { invoke } from "@tauri-apps/api/core"

/**
 * Gateway for the broadcast output window's NDI IPC: shipping raw RGBA frames to
 * the backend encoder and querying current NDI status on mount. Keeps the output
 * component free of Tauri command names and the raw-binary `invoke` shape.
 */

export interface NdiStatus {
  active: boolean
  width: number
  height: number
  fps: number
}

/**
 * Ship one raw RGBA frame to the NDI encoder. The pixel `buffer` crosses Tauri's
 * binary IPC as the raw request body (no base64, no JSON), with dimensions and
 * the target output id in headers.
 */
export function sendNdiFrame(
  outputId: string,
  buffer: ArrayBuffer,
  width: number,
  height: number
): Promise<unknown> {
  return invoke("push_ndi_frame", buffer, {
    headers: {
      "x-output-id": outputId,
      "x-width": String(width),
      "x-height": String(height),
    },
  })
}

/** Query current NDI status for an output (used to fix the open-order race). */
export function getNdiStatus(outputId: string): Promise<NdiStatus | null> {
  return invoke<NdiStatus | null>("get_ndi_status", { outputId })
}
