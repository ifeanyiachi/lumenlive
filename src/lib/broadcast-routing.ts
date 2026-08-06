import { emitTo } from "@tauri-apps/api/event"
import type { BroadcastOutput } from "@/types/broadcast"

export function outputWindowLabel(outputId: string): string {
  return outputId === "main" ? "broadcast" : `broadcast-${outputId}`
}

export function webOverlayLabel(outputId: string): string {
  return outputId === "main" ? "web-overlay" : `web-overlay-${outputId}`
}

export function emitToOutput(
  outputId: string,
  event: string,
  payload: unknown
): void {
  void emitTo(outputWindowLabel(outputId), event, payload).catch(() => {})
}

export function emitToAllOutputs(
  outputs: BroadcastOutput[],
  event: string,
  payload: unknown
): void {
  for (const output of outputs) {
    if (output.enabled) {
      emitToOutput(output.id, event, payload)
    }
  }
}

export function emitToOverlay(
  outputId: string,
  event: string,
  payload: unknown
): void {
  void emitTo(webOverlayLabel(outputId), event, payload).catch(() => {})
}

export function emitToAllOverlays(
  outputs: BroadcastOutput[],
  event: string,
  payload: unknown
): void {
  for (const output of outputs) {
    if (output.enabled) {
      emitToOverlay(output.id, event, payload)
    }
  }
}
