import { useEffect } from "react"
import { toast } from "sonner"
import { onOutputDisplayDisconnected } from "@/services/broadcast-window-gateway"
import { useBroadcastStore } from "@/stores"

/**
 * Always-mounted guard for a projector/HDMI display being unplugged mid-service.
 *
 * The backend's display-watch poller tears the (borderless, non-closable,
 * taskbar-hidden) output window down when its monitor disappears and emits
 * `output_display_disconnected`. This hook makes the control UI reflect that:
 * flip the output's `enabled` flag off so overlay fan-out (`emitToAllOutputs`)
 * stops targeting a dead surface, and tell the operator. When NDI is still
 * feeding the output the physical screen is gone but the network feed continues,
 * so the output stays enabled and the message says so.
 *
 * Lives at the app root (not in the output-settings dialog, which is usually
 * closed during a live service) so it catches the unplug whenever it happens.
 */
export function useOutputDisplayGuard(): void {
  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined
    void onOutputDisplayDisconnected(({ outputId, ndiActive }) => {
      const bs = useBroadcastStore.getState()
      const name = bs.outputs.find((o) => o.id === outputId)?.name ?? "Output"
      // enabled tracks whether the output is actually live: still true iff NDI
      // is carrying it after the screen is gone.
      bs.updateOutput(outputId, { enabled: ndiActive })
      toast.warning(
        ndiActive
          ? `${name}: external display disconnected — NDI feed continues`
          : `${name}: external display disconnected — output closed`
      )
    }).then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
