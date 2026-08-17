import { useCallback, useEffect, useState } from "react"
import {
  openBroadcastWindow,
  ensureBroadcastWindow,
  closeBroadcastWindow,
  requestOutputResync,
  onOutputReady,
  isBroadcastWindowOpen,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import { startNdi, stopNdi, emitNdiConfig } from "@/services/ndi-gateway"
import {
  ndiFrameRateToNumber,
  ndiResolutionToDimensions,
} from "@/lib/broadcast/ndi"
import {
  operatorScreenIndex,
  preferredOutputMonitor,
} from "@/lib/broadcast/monitors"
import { reportOutputError } from "@/services/output-errors"
import { useBroadcastStore } from "@/stores"
import type {
  NdiAlphaMode,
  NdiFrameRate,
  NdiResolution,
  NdiStartRequest,
} from "@/types"

export type OutputType = "display" | "ndi"

/**
 * Route a theme change to the correct store action for the two built-in outputs.
 * Both actions update the output's `themeId` and re-sync all outputs; kept as a
 * small router so the shared card doesn't hardcode `main`/`alt` store methods.
 */
function setOutputTheme(outputId: string, id: string): void {
  const bs = useBroadcastStore.getState()
  if (outputId === "alt") bs.setAltActiveTheme(id)
  else bs.setActiveTheme(id)
}

export interface UseOutputControllerArgs {
  outputId: string
  /** Whether the settings dialog is open (drives the reconcile-on-open effect). */
  open: boolean
  monitors: Monitor[]
  defaultOutputType: OutputType
  defaultNdiSourceName: string
}

/** Everything one output card needs: per-output state, derived flags, handlers. */
export interface OutputController {
  outputId: string
  enabled: boolean
  outputType: OutputType
  setOutputType: (t: OutputType) => void
  selectedMonitor: string
  setSelectedMonitor: (m: string) => void
  /** Resolved theme id from the store (falls back to the first theme). */
  themeId: string
  setTheme: (id: string) => void
  ndiSourceName: string
  setNdiSourceName: (s: string) => void
  ndiResolution: NdiResolution
  setNdiResolution: (r: NdiResolution) => void
  ndiFrameRate: NdiFrameRate
  setNdiFrameRate: (r: NdiFrameRate) => void
  ndiAlphaMode: NdiAlphaMode
  setNdiAlphaMode: (m: NdiAlphaMode) => void
  ndiActive: boolean
  /** True when this output targets the operator's own screen (display blocked). */
  displayOnOperatorScreen: boolean
  toggle: (enabled: boolean) => Promise<void>
  toggleNdi: () => Promise<void>
  /** Push this output's current NDI config to its window (used on output-ready). */
  pushNdiConfig: (active?: boolean) => void
}

/**
 * Owns one broadcast output's UI state and activation choreography, parameterized
 * by `outputId` — the single source behind both the Main and Alternate cards
 * (D3), replacing the wholesale `alt`-prefixed copy.
 *
 * Stage-aware by construction: window opens and NDI `ensure` pass a `"stage"`
 * argument and re-sync the stage feed **iff** `output.mode === "stage"` in the
 * store — so a normal output (main) behaves exactly as before, and a stage output
 * (alt) keeps its stage pathway, with one code path.
 *
 * Unification (approved approach A): the theme value is derived from the store
 * (not a mirrored local `useState` + reconcile effect), so *every* output's theme
 * select tracks external store changes — closing the old main-only gap and
 * removing the P4 mirror effect. The old 750ms preview poll is dropped: it
 * discarded its result and had no side effect (dead code), so removing it is
 * behavior-preserving.
 */
export function useOutputController({
  outputId,
  open,
  monitors,
  defaultOutputType,
  defaultNdiSourceName,
}: UseOutputControllerArgs): OutputController {
  const [enabled, setEnabled] = useState(false)
  const [outputType, setOutputType] = useState<OutputType>(defaultOutputType)
  const [selectedMonitor, setSelectedMonitor] = useState("0")
  const [isOpen, setIsOpen] = useState(false)
  const [ndiSourceName, setNdiSourceName] = useState(defaultNdiSourceName)
  const [ndiResolution, setNdiResolution] = useState<NdiResolution>("r1080p")
  const [ndiFrameRate, setNdiFrameRate] = useState<NdiFrameRate>("fps24")
  const [ndiAlphaMode, setNdiAlphaMode] =
    useState<NdiAlphaMode>("straightAlpha")
  const [ndiActive, setNdiActive] = useState(false)

  // Theme derived straight from the store output so it always reflects external
  // changes (setActiveTheme elsewhere, theme deletion, etc.).
  const storeThemeId = useBroadcastStore(
    (s) => s.outputs.find((o) => o.id === outputId)?.themeId
  )
  const firstThemeId = useBroadcastStore((s) => s.themes[0]?.id)
  const themeId = storeThemeId ?? firstThemeId ?? ""
  const setTheme = useCallback(
    (id: string) => setOutputTheme(outputId, id),
    [outputId]
  )

  // The stage argument for window ops: "stage" only when this output is in stage
  // mode (read live from the store; main never is, alt may be).
  const stageArg = useCallback((): "stage" | undefined => {
    const o = useBroadcastStore
      .getState()
      .outputs.find((x) => x.id === outputId)
    return o?.mode === "stage" ? "stage" : undefined
  }, [outputId])

  // Sync this output's content, plus the stage feed when it's a stage output.
  const syncContent = useCallback(() => {
    const bs = useBroadcastStore.getState()
    bs.syncBroadcastOutputFor(outputId)
    if (bs.outputs.find((o) => o.id === outputId)?.mode === "stage") {
      bs.syncStageOutput()
    }
  }, [outputId])

  const pushNdiConfig = useCallback(
    (active: boolean = ndiActive) => {
      const dims = ndiResolutionToDimensions(ndiResolution)
      void emitNdiConfig(outputId, {
        active,
        fps: ndiFrameRateToNumber(ndiFrameRate),
        width: dims.width,
        height: dims.height,
        alphaMode: ndiAlphaMode,
      }).catch(() => {})
    },
    [outputId, ndiActive, ndiResolution, ndiFrameRate, ndiAlphaMode]
  )

  // Open the display output window on the selected monitor. Driven by the enable
  // switch; errors bubble to the switch handler.
  const openWindow = useCallback(async () => {
    let synced = false
    const unlisten = await onOutputReady(() => {
      synced = true
      syncContent()
      pushNdiConfig()
      unlisten()
    })
    await openBroadcastWindow(outputId, Number(selectedMonitor), stageArg())
    const opened = await isBroadcastWindowOpen(outputId)
    setIsOpen(opened)
    if (!opened) {
      unlisten()
    } else {
      // A reused window (already mounted from NDI) won't re-emit output-ready, so
      // ask it to re-announce; if that still doesn't fire in 500ms, push directly.
      await requestOutputResync(outputId)
      setTimeout(() => {
        if (!synced) {
          syncContent()
          pushNdiConfig()
          unlisten()
        }
      }, 500)
    }
  }, [outputId, selectedMonitor, syncContent, pushNdiConfig, stageArg])

  const toggleNdi = useCallback(async () => {
    try {
      if (ndiActive) {
        await stopNdi(outputId)
        pushNdiConfig(false)
        setNdiActive(false)
        if (!isOpen) {
          await closeBroadcastWindow(outputId).catch(() => {})
        }
      } else {
        await ensureBroadcastWindow(outputId, stageArg())
        const request: NdiStartRequest = {
          sourceName: ndiSourceName,
          resolution: ndiResolution,
          frameRate: ndiFrameRate,
          alphaMode: ndiAlphaMode,
        }
        const session = await startNdi(outputId, request)
        setNdiActive(true)
        useBroadcastStore.getState().syncBroadcastOutputFor(outputId)
        void emitNdiConfig(outputId, {
          active: true,
          fps: session.fps,
          width: session.width,
          height: session.height,
          alphaMode: session.alphaMode,
        }).catch(() => {})
        setTimeout(() => {
          useBroadcastStore.getState().syncBroadcastOutputFor(outputId)
          pushNdiConfig(true)
        }, 300)
      }
    } catch (error) {
      reportOutputError("Couldn't toggle NDI output", error)
    }
  }, [
    outputId,
    ndiActive,
    isOpen,
    ndiSourceName,
    ndiResolution,
    ndiFrameRate,
    ndiAlphaMode,
    pushNdiConfig,
    stageArg,
  ])

  const toggle = useCallback(
    async (next: boolean) => {
      // Never fullscreen output over the operator's own screen — with no external
      // display, output stays off and the operator works from the in-app preview
      // (+ NDI). The switch is also disabled in this state; this guards the
      // programmatic path too.
      if (
        next &&
        outputType === "display" &&
        monitors.length > 0 &&
        Number(selectedMonitor) === operatorScreenIndex(monitors)
      ) {
        return
      }
      setEnabled(next)
      try {
        if (next) {
          if (outputType === "display" && monitors.length > 0) {
            await openWindow()
          }
        } else {
          if (isOpen) {
            await closeBroadcastWindow(outputId)
            setIsOpen(false)
          }
          if (ndiActive) {
            await stopNdi(outputId)
            pushNdiConfig(false)
            setNdiActive(false)
          }
        }
      } catch (error) {
        reportOutputError("Couldn't switch the output", error)
      }
    },
    [
      outputId,
      outputType,
      monitors,
      selectedMonitor,
      isOpen,
      ndiActive,
      openWindow,
      pushNdiConfig,
    ]
  )

  // When displays change, steer a target still pointing at the operator's screen
  // to the first external monitor (a deliberate external pick is left alone).
  useEffect(() => {
    if (monitors.length === 0) return
    const operator = operatorScreenIndex(monitors)
    const external = preferredOutputMonitor(monitors)
    if (external === operator) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedMonitor((prev) =>
      Number(prev) === operator ? String(external) : prev
    )
  }, [monitors])

  // Keep the store's `enabled` flag truthful to whether this output is actually
  // live — a display window is open OR NDI is running. Cross-window fan-out
  // (visibility Black/Clear/Logo, alerts, countdowns, props, web content) routes
  // only to `enabled` outputs (see `emitToAllOutputs`), so without this the
  // external monitor would receive content — which emits unconditionally — but
  // silently miss every overlay/visibility event. One effect over the two state
  // vars every transition flows through (open, close, NDI start/stop, reconcile)
  // so no path can leave the flag stale.
  useEffect(() => {
    useBroadcastStore
      .getState()
      .updateOutput(outputId, { enabled: isOpen || ndiActive })
  }, [outputId, isOpen, ndiActive])

  // Reflect the real output-window state whenever the dialog opens — an output
  // may already be live from a previous session.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const openNow = await isBroadcastWindowOpen(outputId)
      if (cancelled) return
      setIsOpen(openNow)
      setEnabled(openNow)
    })()
    return () => {
      cancelled = true
    }
  }, [open, outputId])

  const displayOnOperatorScreen =
    outputType === "display" &&
    monitors.length > 0 &&
    Number(selectedMonitor) === operatorScreenIndex(monitors)

  return {
    outputId,
    enabled,
    outputType,
    setOutputType,
    selectedMonitor,
    setSelectedMonitor,
    themeId,
    setTheme,
    ndiSourceName,
    setNdiSourceName,
    ndiResolution,
    setNdiResolution,
    ndiFrameRate,
    setNdiFrameRate,
    ndiAlphaMode,
    setNdiAlphaMode,
    ndiActive,
    displayOnOperatorScreen,
    toggle,
    toggleNdi,
    pushNdiConfig,
  }
}
