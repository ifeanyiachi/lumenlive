import { useEffect } from "react"
import { toast } from "sonner"
import {
  onOutputDisplayConnected,
  onOutputDisplayDisconnected,
  requestOutputResync,
} from "@/services/broadcast-window-gateway"
import { useBroadcastStore } from "@/stores"
import { useCountdownStore } from "@/stores/countdown-store"

/**
 * Always-mounted guard for a projector/HDMI display being unplugged (and plugged
 * back in) mid-service.
 *
 * The backend's display-watch poller does NOT tear the output down on unplug — it
 * *hides* the (borderless, non-closable, taskbar-hidden) window and keeps the
 * output enabled, so overlay/content events keep flowing to the live-but-hidden
 * surface. This hook only surfaces the state to the operator:
 *  - on `output_display_disconnected`: leave `enabled` alone (the output is still
 *    logically live and will resume itself) and warn that we're waiting for the
 *    display to return;
 *  - on `output_display_connected`: re-push current content so the just-revealed
 *    projector paints immediately, and confirm it's back.
 *
 * Lives at the app root (not in the output-settings dialog, which is usually
 * closed during a live service) so it catches the unplug/replug whenever it
 * happens.
 */
export function useOutputDisplayGuard(): void {
  useEffect(() => {
    let cancelled = false
    const unlisteners: Array<() => void> = []
    const track = (p: Promise<() => void>) => {
      void p.then((fn) => {
        if (cancelled) fn()
        else unlisteners.push(fn)
      })
    }

    track(
      onOutputDisplayDisconnected(({ outputId, ndiActive }) => {
        const bs = useBroadcastStore.getState()
        const name = bs.outputs.find((o) => o.id === outputId)?.name ?? "Output"
        // The output stays enabled: its window is only hidden and resumes on
        // replug. Just tell the operator what happened.
        toast.warning(
          ndiActive
            ? `${name}: external display disconnected — NDI feed continues, will resume when reconnected`
            : `${name}: external display disconnected — will resume automatically when reconnected`
        )
      })
    )

    track(
      onOutputDisplayConnected(({ outputId }) => {
        const bs = useBroadcastStore.getState()
        const name = bs.outputs.find((o) => o.id === outputId)?.name ?? "Output"
        // The window was hidden while unplugged (its render loop throttled), so
        // re-push the current program/stage/countdown state to force a fresh paint.
        bs.syncBroadcastOutputFor(outputId)
        useCountdownStore.getState().resyncOutputs()
        void requestOutputResync(outputId).catch(() => {})
        toast.success(`${name}: external display reconnected`)
      })
    )

    return () => {
      cancelled = true
      for (const fn of unlisteners) fn()
    }
  }, [])
}
