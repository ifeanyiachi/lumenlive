import { useState, useEffect, useCallback } from "react"
import {
  openBroadcastWindow,
  ensureBroadcastWindow,
  closeBroadcastWindow,
  requestOutputResync,
  onOutputReady,
  isBroadcastWindowOpen,
  listMonitors,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import { startNdi, stopNdi, emitNdiConfig } from "@/services/ndi-gateway"
import {
  ndiFrameRateToNumber,
  ndiResolutionToDimensions,
} from "@/lib/broadcast/ndi"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useBroadcastStore, useCountdownStore } from "@/stores"
import type {
  NdiAlphaMode,
  NdiFrameRate,
  NdiResolution,
  NdiStartRequest,
} from "@/types"
import {
  MonitorIcon,
  CastIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  RadioIcon,
  LayersIcon,
} from "lucide-react"
import { OutputManager } from "@/components/broadcast/output-manager"
import { toast } from "sonner"

type OutputType = "display" | "ndi"

// Tauri rejects with "Command <name> not found" when a backend command isn't
// registered yet (e.g. an in-progress dev build). Those are expected in dev
// and shouldn't alarm the user; genuine runtime failures should surface.
function isMissingCommand(error: unknown): boolean {
  return /not found|unknown command/i.test(String(error))
}

function reportOutputError(message: string, error: unknown) {
  console.error(message, error)
  if (!isMissingCommand(error)) {
    toast.error(message, { description: String(error) })
  }
}

// Monitor enumeration and preview windows require the Tauri desktop runtime.
// In a plain browser there is no display API available, so we surface a clear
// message rather than a silently-empty, disabled dropdown.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const NDI_RESOLUTION_OPTIONS: Array<{ value: NdiResolution; label: string }> = [
  { value: "r1080p", label: "1080p (1920×1080)" },
  { value: "r720p", label: "720p (1280×720)" },
  { value: "r4k", label: "4K (3840×2160)" },
]

const NDI_FRAME_RATE_OPTIONS: Array<{ value: NdiFrameRate; label: string }> = [
  { value: "fps24", label: "24 fps" },
  { value: "fps30", label: "30 fps" },
  { value: "fps60", label: "60 fps" },
]

const NDI_ALPHA_OPTIONS: Array<{ value: NdiAlphaMode; label: string }> = [
  { value: "noneOpaque", label: "None (Opaque)" },
  { value: "straightAlpha", label: "Straight Alpha" },
  { value: "premultipliedAlpha", label: "Premultiplied Alpha" },
]

export function BroadcastSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const mainOutput = outputs.find((o) => o.id === "main")
  const altOutput = outputs.find((o) => o.id === "alt")

  // Main output state
  const [mainEnabled, setMainEnabled] = useState(false)
  const [mainThemeId, setMainThemeId] = useState(
    mainOutput?.themeId ?? themes[0]?.id ?? ""
  )
  const [outputType, setOutputType] = useState<OutputType>("display")
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState("0")
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [ndiSourceName, setNdiSourceName] = useState("LumenLive Output")
  const [ndiResolution, setNdiResolution] = useState<NdiResolution>("r1080p")
  const [ndiFrameRate, setNdiFrameRate] = useState<NdiFrameRate>("fps24")
  const [ndiAlphaMode, setNdiAlphaMode] =
    useState<NdiAlphaMode>("straightAlpha")
  const [ndiActive, setNdiActive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [outputManagerOpen, setOutputManagerOpen] = useState(false)

  // Alternate output state
  const [altEnabled, setAltEnabled] = useState(false)
  const [altThemeId, setAltThemeId] = useState(
    altOutput?.themeId ?? themes[0]?.id ?? ""
  )
  const [altOutputType, setAltOutputType] = useState<OutputType>("ndi")
  const [altSelectedMonitor, setAltSelectedMonitor] = useState("0")
  const [altIsPreviewOpen, setAltIsPreviewOpen] = useState(false)
  const [altNdiSourceName, setAltNdiSourceName] = useState("LumenLive Alt")
  const [altNdiResolution, setAltNdiResolution] =
    useState<NdiResolution>("r1080p")
  const [altNdiFrameRate, setAltNdiFrameRate] = useState<NdiFrameRate>("fps24")
  const [altNdiAlphaMode, setAltNdiAlphaMode] =
    useState<NdiAlphaMode>("straightAlpha")
  const [altNdiActive, setAltNdiActive] = useState(false)

  const syncBroadcastOutput = useCallback(() => {
    useBroadcastStore.getState().syncBroadcastOutput()
  }, [])

  const syncNdiConfigToOutput = useCallback(
    (
      outputId: string,
      active: boolean,
      frameRate: NdiFrameRate,
      resolution: NdiResolution
    ) => {
      const dims = ndiResolutionToDimensions(resolution)
      void emitNdiConfig(outputId, {
        active,
        fps: ndiFrameRateToNumber(frameRate),
        width: dims.width,
        height: dims.height,
      }).catch(() => {})
    },
    []
  )

  const reconcilePreviewState = useCallback((outputId: string = "main") => {
    return isBroadcastWindowOpen(outputId)
  }, [])

  const fetchMonitors = useCallback(async () => {
    if (!isTauri) {
      setMonitors([])
      return
    }
    setRefreshing(true)
    try {
      const result = await listMonitors()
      setMonitors(result)
    } catch {
      setMonitors([])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // fetchMonitors is a shared async action (also used by refresh buttons);
    // its internal setRefreshing is a loading flag, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) fetchMonitors()
  }, [open, fetchMonitors])

  // Mirror the store's active theme into local selection state when it changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mainOutput?.themeId) setMainThemeId(mainOutput.themeId)
  }, [mainOutput?.themeId])

  useEffect(() => {
    if (!open) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const unlistenPromise = onOutputReady(() => {
      useBroadcastStore.getState().syncBroadcastOutput()
      // Re-push any live countdowns so a just-opened output isn't blank.
      useCountdownStore.getState().resyncOutputs()
      syncNdiConfigToOutput("main", ndiActive, ndiFrameRate, ndiResolution)
      syncNdiConfigToOutput(
        "alt",
        altNdiActive,
        altNdiFrameRate,
        altNdiResolution
      )
      timeoutId = setTimeout(() => {
        useBroadcastStore.getState().syncBroadcastOutput()
      }, 150)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [
    open,
    isPreviewOpen,
    ndiActive,
    ndiFrameRate,
    ndiResolution,
    altNdiActive,
    altNdiFrameRate,
    altNdiResolution,
    syncBroadcastOutput,
    syncNdiConfigToOutput,
  ])

  useEffect(() => {
    if (!open || !isPreviewOpen) return

    const intervalId = setInterval(() => {
      void reconcilePreviewState()
    }, 750)

    return () => {
      clearInterval(intervalId)
    }
  }, [open, isPreviewOpen, reconcilePreviewState])

  const handleMainThemeChange = (id: string) => {
    setMainThemeId(id)
    useBroadcastStore.getState().setActiveTheme(id)
  }

  const handleTogglePreview = async () => {
    try {
      if (isPreviewOpen) {
        await closeBroadcastWindow("main")
        setIsPreviewOpen(await reconcilePreviewState("main"))
      } else {
        let synced = false
        const unlisten = await onOutputReady(() => {
          synced = true
          useBroadcastStore.getState().syncBroadcastOutputFor("main")
          syncNdiConfigToOutput("main", ndiActive, ndiFrameRate, ndiResolution)
          unlisten()
        })
        await openBroadcastWindow("main", Number(selectedMonitor))
        const opened = await reconcilePreviewState("main")
        setIsPreviewOpen(opened)
        if (!opened) {
          unlisten()
        } else {
          // If the window was reused (already mounted from NDI), the React
          // useEffect won't re-run, so broadcast:output-ready is never
          // re-emitted. Ask the window to re-announce, and if that still
          // doesn't trigger within 500ms, push content directly.
          await requestOutputResync("main")
          setTimeout(() => {
            if (!synced) {
              useBroadcastStore.getState().syncBroadcastOutputFor("main")
              syncNdiConfigToOutput(
                "main",
                ndiActive,
                ndiFrameRate,
                ndiResolution
              )
              unlisten()
            }
          }, 500)
        }
      }
    } catch (error) {
      reportOutputError("Couldn't toggle the preview window", error)
    }
  }

  const handleToggleNdi = async () => {
    try {
      if (ndiActive) {
        await stopNdi("main")
        syncNdiConfigToOutput("main", false, ndiFrameRate, ndiResolution)
        setNdiActive(false)
        if (!isPreviewOpen) {
          await closeBroadcastWindow("main").catch(() => {})
        }
      } else {
        await ensureBroadcastWindow("main")
        const request: NdiStartRequest = {
          sourceName: ndiSourceName,
          resolution: ndiResolution,
          frameRate: ndiFrameRate,
          alphaMode: ndiAlphaMode,
        }
        const session = await startNdi("main", request)
        setNdiActive(true)
        useBroadcastStore.getState().syncBroadcastOutputFor("main")
        void emitNdiConfig("main", {
          active: true,
          fps: session.fps,
          width: session.width,
          height: session.height,
        }).catch(() => {})
        setTimeout(() => {
          useBroadcastStore.getState().syncBroadcastOutputFor("main")
          syncNdiConfigToOutput("main", true, ndiFrameRate, ndiResolution)
        }, 300)
      }
    } catch (error) {
      reportOutputError("Couldn't toggle NDI output", error)
    }
  }

  const handleMainToggle = async (enabled: boolean) => {
    setMainEnabled(enabled)
    if (!enabled) {
      if (isPreviewOpen) {
        try {
          await closeBroadcastWindow("main")
        } catch {
          console.error("Failed to close broadcast window")
        }
        setIsPreviewOpen(false)
      }
      if (ndiActive) {
        try {
          await stopNdi("main")
        } catch {
          console.error("Failed to stop NDI")
        }
        syncNdiConfigToOutput("main", false, ndiFrameRate, ndiResolution)
        setNdiActive(false)
      }
    }
  }

  // ── Alternate Output Handlers ──

  const handleAltThemeChange = (id: string) => {
    setAltThemeId(id)
    useBroadcastStore.getState().setAltActiveTheme(id)
  }

  const handleAltTogglePreview = async () => {
    try {
      if (altIsPreviewOpen) {
        await closeBroadcastWindow("alt")
        setAltIsPreviewOpen(await reconcilePreviewState("alt"))
      } else {
        const altOutput = useBroadcastStore
          .getState()
          .outputs.find((o) => o.id === "alt")
        let synced = false
        const unlisten = await onOutputReady(() => {
          synced = true
          const bs = useBroadcastStore.getState()
          bs.syncBroadcastOutputFor("alt")
          bs.syncStageOutput()
          syncNdiConfigToOutput(
            "alt",
            altNdiActive,
            altNdiFrameRate,
            altNdiResolution
          )
          unlisten()
        })
        await openBroadcastWindow(
          "alt",
          Number(altSelectedMonitor),
          altOutput?.mode === "stage" ? "stage" : undefined
        )
        const opened = await reconcilePreviewState("alt")
        setAltIsPreviewOpen(opened)
        if (!opened) {
          unlisten()
        } else {
          await requestOutputResync("alt")
          setTimeout(() => {
            if (!synced) {
              const bs = useBroadcastStore.getState()
              bs.syncBroadcastOutputFor("alt")
              bs.syncStageOutput()
              syncNdiConfigToOutput(
                "alt",
                altNdiActive,
                altNdiFrameRate,
                altNdiResolution
              )
              unlisten()
            }
          }, 500)
        }
      }
    } catch (error) {
      reportOutputError("Couldn't toggle the alt preview window", error)
    }
  }

  const handleAltToggleNdi = async () => {
    try {
      if (altNdiActive) {
        await stopNdi("alt")
        syncNdiConfigToOutput("alt", false, altNdiFrameRate, altNdiResolution)
        setAltNdiActive(false)
        if (!altIsPreviewOpen) {
          await closeBroadcastWindow("alt").catch(() => {})
        }
      } else {
        const altOutput = useBroadcastStore
          .getState()
          .outputs.find((o) => o.id === "alt")
        await ensureBroadcastWindow(
          "alt",
          altOutput?.mode === "stage" ? "stage" : undefined
        )
        const request: NdiStartRequest = {
          sourceName: altNdiSourceName,
          resolution: altNdiResolution,
          frameRate: altNdiFrameRate,
          alphaMode: altNdiAlphaMode,
        }
        const session = await startNdi("alt", request)
        setAltNdiActive(true)
        useBroadcastStore.getState().syncBroadcastOutputFor("alt")
        void emitNdiConfig("alt", {
          active: true,
          fps: session.fps,
          width: session.width,
          height: session.height,
        }).catch(() => {})
        setTimeout(() => {
          useBroadcastStore.getState().syncBroadcastOutputFor("alt")
          syncNdiConfigToOutput("alt", true, altNdiFrameRate, altNdiResolution)
        }, 300)
      }
    } catch (error) {
      reportOutputError("Couldn't toggle alt NDI output", error)
    }
  }

  const handleAltToggle = async (enabled: boolean) => {
    setAltEnabled(enabled)
    if (!enabled) {
      if (altIsPreviewOpen) {
        await closeBroadcastWindow("alt").catch(() => {})
        setAltIsPreviewOpen(false)
      }
      if (altNdiActive) {
        await stopNdi("alt").catch(() => {})
        syncNdiConfigToOutput("alt", false, altNdiFrameRate, altNdiResolution)
        setAltNdiActive(false)
      }
    }
  }

  // The primary display is the one whose top-left sits at the virtual-desktop
  // origin (0,0) on Windows. The control window almost always lives here, so we
  // flag it in the dropdown and warn when it is chosen as a broadcast target.
  const primaryMonitorIndex = monitors.findIndex(
    (m) => m.position.x === 0 && m.position.y === 0
  )

  const monitorLabel = (m: Monitor, i: number) =>
    `${m.name ?? `Display ${i + 1}`} (${m.size.width}×${m.size.height})${
      i === primaryMonitorIndex ? " — Primary (this screen)" : ""
    }`

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-[700px]"
          showCloseButton={true}
        >
          <DialogHeader>
            {/* Reserve room on the right so the "Manage Outputs" button clears
                the dialog's absolute top-4 right-4 close (X) button. */}
            <div className="flex items-center justify-between pr-10">
              <DialogTitle>Broadcast</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setOutputManagerOpen(true)}
              >
                <LayersIcon className="size-3.5" />
                Manage Outputs
              </Button>
            </div>
            <DialogDescription>
              Configure outputs with independent themes and routing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            {/* ── Main Output Card ── */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MonitorIcon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Main Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      mainEnabled ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {mainEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={mainEnabled}
                    onCheckedChange={handleMainToggle}
                  />
                </div>
              </div>

              {/* Theme selector */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Theme</label>
                <Select
                  value={mainThemeId}
                  onValueChange={handleMainThemeChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Output type toggle */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Output Type
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setOutputType("display")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                      outputType === "display"
                        ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MonitorIcon className="size-3.5" />
                    External Display
                  </button>
                  <button
                    onClick={() => setOutputType("ndi")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                      outputType === "ndi"
                        ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <RadioIcon className="size-3.5" />
                    NDI
                  </button>
                </div>
              </div>

              {/* Output-type-specific controls */}
              {outputType === "display" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">
                        Target Monitor
                      </label>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={refreshing}
                        onClick={fetchMonitors}
                        className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground"
                      >
                        <RefreshCwIcon
                          className={cn("size-3", refreshing && "animate-spin")}
                        />
                        Refresh
                      </Button>
                    </div>
                    <Select
                      value={selectedMonitor}
                      onValueChange={setSelectedMonitor}
                      disabled={monitors.length === 0}
                    >
                      <SelectTrigger
                        className="w-full"
                        disabled={monitors.length === 0}
                      >
                        <SelectValue
                          placeholder={
                            !isTauri
                              ? "Desktop app required"
                              : monitors.length === 0
                                ? "No monitors detected"
                                : "Select monitor"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {monitors.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {monitorLabel(m, i)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isTauri && (
                      <p className="text-[0.625rem] text-muted-foreground">
                        Display output and preview are only available in the
                        LumenLive desktop app.
                      </p>
                    )}
                    {monitors.length > 0 &&
                      Number(selectedMonitor) === primaryMonitorIndex && (
                        <p className="text-[0.625rem] text-amber-500">
                          This is your primary display — the output will open on
                          the same screen as your controls.
                        </p>
                      )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={monitors.length === 0}
                    onClick={handleTogglePreview}
                  >
                    {isPreviewOpen ? (
                      <>
                        <EyeOffIcon className="size-3.5" />
                        Close Preview
                      </>
                    ) : (
                      <>
                        <EyeIcon className="size-3.5" />
                        Open Preview
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        Resolution
                      </label>
                      <Select
                        value={ndiResolution}
                        onValueChange={(value) =>
                          setNdiResolution(value as NdiResolution)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NDI_RESOLUTION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        Frame Rate
                      </label>
                      <Select
                        value={ndiFrameRate}
                        onValueChange={(value) =>
                          setNdiFrameRate(value as NdiFrameRate)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NDI_FRAME_RATE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Alpha Channel
                    </label>
                    <Select
                      value={ndiAlphaMode}
                      onValueChange={(value) =>
                        setNdiAlphaMode(value as NdiAlphaMode)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NDI_ALPHA_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Source Name
                    </label>
                    <Input
                      value={ndiSourceName}
                      onChange={(e) => setNdiSourceName(e.target.value)}
                      placeholder="LumenLive Output"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full gap-1.5",
                      ndiActive &&
                        "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                    )}
                    onClick={handleToggleNdi}
                  >
                    {ndiActive ? (
                      <>
                        <CastIcon className="size-3.5" />
                        Stop NDI
                      </>
                    ) : (
                      <>
                        <CastIcon className="size-3.5" />
                        Start NDI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* ── Alternate Output Card ── */}
            <div className="space-y-4 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CastIcon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Alternate Output</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs",
                      altEnabled ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {altEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={altEnabled}
                    onCheckedChange={handleAltToggle}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Theme</label>
                <Select value={altThemeId} onValueChange={handleAltThemeChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Output Type
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setAltOutputType("display")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                      altOutputType === "display"
                        ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MonitorIcon className="size-3.5" />
                    External Display
                  </button>
                  <button
                    onClick={() => setAltOutputType("ndi")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                      altOutputType === "ndi"
                        ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <RadioIcon className="size-3.5" />
                    NDI
                  </button>
                </div>
              </div>

              {altOutputType === "display" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">
                        Target Monitor
                      </label>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={refreshing}
                        onClick={fetchMonitors}
                        className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground"
                      >
                        <RefreshCwIcon
                          className={cn("size-3", refreshing && "animate-spin")}
                        />
                        Refresh
                      </Button>
                    </div>
                    <Select
                      value={altSelectedMonitor}
                      onValueChange={setAltSelectedMonitor}
                      disabled={monitors.length === 0}
                    >
                      <SelectTrigger
                        className="w-full"
                        disabled={monitors.length === 0}
                      >
                        <SelectValue
                          placeholder={
                            !isTauri
                              ? "Desktop app required"
                              : monitors.length === 0
                                ? "No monitors detected"
                                : "Select monitor"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {monitors.map((m, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {monitorLabel(m, i)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isTauri && (
                      <p className="text-[0.625rem] text-muted-foreground">
                        Display output and preview are only available in the
                        LumenLive desktop app.
                      </p>
                    )}
                    {monitors.length > 0 &&
                      Number(altSelectedMonitor) === primaryMonitorIndex && (
                        <p className="text-[0.625rem] text-amber-500">
                          This is your primary display — the output will open on
                          the same screen as your controls.
                        </p>
                      )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={monitors.length === 0}
                    onClick={handleAltTogglePreview}
                  >
                    {altIsPreviewOpen ? (
                      <>
                        <EyeOffIcon className="size-3.5" />
                        Close Preview
                      </>
                    ) : (
                      <>
                        <EyeIcon className="size-3.5" />
                        Open Preview
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        Resolution
                      </label>
                      <Select
                        value={altNdiResolution}
                        onValueChange={(v) =>
                          setAltNdiResolution(v as NdiResolution)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NDI_RESOLUTION_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        Frame Rate
                      </label>
                      <Select
                        value={altNdiFrameRate}
                        onValueChange={(v) =>
                          setAltNdiFrameRate(v as NdiFrameRate)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NDI_FRAME_RATE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Alpha Channel
                    </label>
                    <Select
                      value={altNdiAlphaMode}
                      onValueChange={(v) =>
                        setAltNdiAlphaMode(v as NdiAlphaMode)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NDI_ALPHA_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">
                      Source Name
                    </label>
                    <Input
                      value={altNdiSourceName}
                      onChange={(e) => setAltNdiSourceName(e.target.value)}
                      placeholder="LumenLive Alt"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "w-full gap-1.5",
                      altNdiActive &&
                        "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
                    )}
                    onClick={handleAltToggleNdi}
                  >
                    {altNdiActive ? (
                      <>
                        <CastIcon className="size-3.5" />
                        Stop NDI
                      </>
                    ) : (
                      <>
                        <CastIcon className="size-3.5" />
                        Start NDI
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <OutputManager
        open={outputManagerOpen}
        onOpenChange={setOutputManagerOpen}
      />
    </>
  )
}
