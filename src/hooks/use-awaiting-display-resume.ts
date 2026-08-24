import { useEffect } from "react"
import { toast } from "sonner"
import {
  listMonitors,
  onOutputReady,
  openBroadcastWindow,
  requestOutputResync,
} from "@/services/broadcast-window-gateway"
import {
  monitorFingerprint,
  operatorScreenIndex,
  resolveOutputMonitor,
  type LabeledMonitor,
} from "@/lib/broadcast/monitors"
import { useBroadcastStore } from "@/stores"
import { useCountdownStore } from "@/stores/countdown-store"
import { isManagedElsewhere, isTauri } from "@/components/broadcast/output-manager/utils"
import type { BroadcastOutput } from "@/types/broadcast"

/**
 * How often (ms) the resume poll re-checks the displays while at least one output
 * is holding for its assigned monitor. Tauri exposes no monitor-hotplug event, so
 * — like the backend display-watch — we poll; only when something is actually
 * awaiting (otherwise the tick is a cheap store read with no IPC).
 */
const RESUME_POLL_MS = 2000

/** Outcome of an activation attempt, so callers can surface the right message. */
export type ActivateResult =
  | "opened" // window opened on the assigned/available display
  | "absent" // assigned display not connected — held, awaiting reconnect
  | "blocked" // resolved display is the operator's own screen — not opened
  | "skipped" // not applicable (non-Tauri, or a built-in output)

/**
 * Push an extra output's current program/stage/countdown content to its
 * just-opened window, once it announces readiness (with a 500ms fallback for a
 * reused window that never re-emits ready). Mirrors the Output Manager / Alternate
 * Output flow so a resumed window paints immediately.
 */
async function openAndSync(output: BroadcastOutput, monitorIndex: number) {
  const mode = output.mode === "stage" ? "stage" : undefined
  let synced = false
  const syncNow = () => {
    const bs = useBroadcastStore.getState()
    bs.syncBroadcastOutputFor(output.id)
    if (output.mode === "stage") bs.syncStageOutput()
    useCountdownStore.getState().resyncOutputs()
  }
  const unlisten = await onOutputReady(() => {
    synced = true
    syncNow()
    unlisten()
  })
  try {
    await openBroadcastWindow(output.id, monitorIndex, mode)
    await requestOutputResync(output.id)
    setTimeout(() => {
      if (!synced) {
        syncNow()
        unlisten()
      }
    }, 500)
  } catch {
    unlisten()
  }
}

/**
 * Activate one extra output: resolve its assigned display and either open its
 * window there or hold in the "awaiting display" state — the single source of the
 * fail-safe rules (never grab a different screen, never cover the operator).
 * Shared by the Output Manager (manual toggle) and the resume poll below, so both
 * paths behave identically.
 *
 * `monitors` may be passed in to reuse an enumeration the caller already has;
 * otherwise it is fetched. Returns what happened so the caller can toast.
 */
export async function activateExtraOutput(
  outputId: string,
  monitors?: LabeledMonitor[]
): Promise<ActivateResult> {
  if (!isTauri || isManagedElsewhere(outputId)) return "skipped"
  const bs = useBroadcastStore.getState()
  const output = bs.outputs.find((o) => o.id === outputId)
  if (!output) return "skipped"

  const live = monitors ?? (await listMonitors())
  const resolution = resolveOutputMonitor(
    output.monitorTarget,
    output.monitor,
    live
  )

  if (resolution.kind === "absent") {
    // Assigned display isn't here. Keep the switch on (intent to broadcast) and
    // hold — the poll resumes it when the display returns.
    bs.updateOutput(outputId, { enabled: true, awaitingDisplay: true })
    return "absent"
  }

  const monitorIndex = resolution.index
  if (monitorIndex === operatorScreenIndex(live)) {
    // Never fullscreen a non-closable window over the operator's control screen.
    bs.updateOutput(outputId, { enabled: false, awaitingDisplay: false })
    return "blocked"
  }

  // Concrete display found: persist the index + a fresh fingerprint, clear the
  // awaiting flag, and open.
  const monitorTarget = monitorFingerprint(live[monitorIndex])
  bs.updateOutput(outputId, {
    enabled: true,
    awaitingDisplay: false,
    monitor: monitorIndex,
    monitorTarget,
  })
  await openAndSync(
    { ...output, monitor: monitorIndex, monitorTarget },
    monitorIndex
  )
  return "opened"
}

/**
 * Always-mounted resume poll for outputs holding on a disconnected assigned
 * display (the cold-start / first-enable counterpart to the mid-service
 * display-watch, which only covers windows that are already open). While any
 * extra output is `enabled && awaitingDisplay`, it re-enumerates the displays on
 * an interval and opens each output the moment its assigned monitor reappears —
 * so plugging the projector back in "just works" even with the Output Manager
 * closed. Idle (no IPC) whenever nothing is awaiting.
 */
export function useAwaitingDisplayResume(): void {
  useEffect(() => {
    if (!isTauri) return
    let cancelled = false

    const tick = async () => {
      const outputs = useBroadcastStore.getState().outputs
      const awaiting = outputs.filter(
        (o) => o.enabled && o.awaitingDisplay && !isManagedElsewhere(o.id)
      )
      if (awaiting.length === 0) return
      const live = await listMonitors()
      if (cancelled) return
      const operator = operatorScreenIndex(live)
      for (const o of awaiting) {
        const resolution = resolveOutputMonitor(o.monitorTarget, o.monitor, live)
        // Only act once the assigned display is genuinely back on a non-operator
        // screen; otherwise keep holding.
        if (resolution.kind !== "resolved" || resolution.index === operator) {
          continue
        }
        const result = await activateExtraOutput(o.id, live)
        if (cancelled) return
        if (result === "opened") {
          toast.success(`${o.name}: assigned display connected`)
        }
      }
    }

    const timer = setInterval(() => void tick(), RESUME_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])
}
