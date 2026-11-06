/**
 * Surface + lifecycle listeners: NDI config, display config, and the resync
 * request — plus the one-shot startup handshake (fetch current NDI status, then
 * announce output-ready). Registered LAST so `output-ready` fires only after every
 * content listener is live, or the main window's replayed state could race ahead of
 * an unregistered listener. Moved verbatim from the output-window effect.
 */

import { getNdiStatus } from "@/services/ndi-output-gateway"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
  emitOutputReady as sendOutputReady,
} from "@/services/broadcast-content-gateway"
import { OUTPUT_ID, type OutputRuntime } from "../runtime"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerSurfaceListeners(rt: OutputRuntime): EventDisposer {
  const unlistenNdiConfig = listenOutputEvent(
    BROADCAST_EVENTS.ndiConfig,
    (event) => {
      rt.ndiConfigRef.current = event.payload
      rt.logDebug("Received broadcast:ndi-config", event.payload)
      // Toggling NDI changes which surface wins (NDI resolution vs monitor),
      // so re-render to pick up the new surface + object-fit.
      rt.drawRef.current()
      // Push burst when NDI becomes active
      if (event.payload.active) rt.pushNdiBurst()
    }
  )

  // How this output sizes its surface (native / custom / fit). Applied via the
  // draw loop (surface + object-fit are computed there), so we just stash it
  // and redraw. Defaults to native until the first message arrives.
  const unlistenDisplayConfig = listenOutputEvent(
    BROADCAST_EVENTS.displayConfig,
    (event) => {
      rt.displayConfigRef.current = event.payload
      rt.logDebug("Received broadcast:display-config", event.payload)
      rt.drawRef.current()
    }
  )

  // Request current NDI status on mount (fixes race condition
  // where NDI is started before this window opens)
  void getNdiStatus(OUTPUT_ID)
    .then((status) => {
      if (status && status.active) {
        rt.ndiConfigRef.current = {
          active: true,
          fps: status.fps,
          width: status.width,
          height: status.height,
          alphaMode: status.alphaMode,
        }
        rt.logDebug("Fetched NDI status on mount", status)
      }
    })
    .catch(() => {
      // Command may not exist yet
    })

  sendOutputReady()
  rt.logDebug("Sent broadcast:output-ready")

  // When an already-mounted window is shown again (e.g. hidden NDI window
  // reused as preview), the useEffect above won't re-run, so the main window
  // can ask us to re-announce readiness via this event.
  const unlistenResync = listenOutputEvent(
    BROADCAST_EVENTS.requestResync,
    () => {
      rt.logDebug("Received resync request, re-emitting output-ready")
      sendOutputReady()
    }
  )

  return disposeSubscriptions([
    unlistenNdiConfig,
    unlistenDisplayConfig,
    unlistenResync,
  ])
}
