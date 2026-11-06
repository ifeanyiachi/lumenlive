import { emitTo } from "@tauri-apps/api/event"
import type { BroadcastOutput } from "@/types/broadcast"

export function outputWindowLabel(outputId: string): string {
  return outputId === "main" ? "broadcast" : `broadcast-${outputId}`
}

export function emitToOutput(
  outputId: string,
  event: string,
  payload: unknown
): void {
  void emitTo(outputWindowLabel(outputId), event, payload).catch(() => {})
}

// Fan a forward event out to the outputs that are live (`enabled`). Callers
// that must reach a window regardless of state (e.g. tearing down an embedded
// player) emit directly via {@link emitToOutput} instead. NOTE: this relies on
// `enabled` faithfully tracking whether an output's window is actually open —
// `useOutputController` keeps the built-in main/alt outputs in sync as their
// windows open/close, so visibility and overlay events reach them.
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
