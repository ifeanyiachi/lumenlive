import { useState, useEffect, useCallback } from "react"
import {
  onOutputReady,
  listMonitors,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import { isTauri } from "@/services/tauri-env"
import { reportOutputError } from "@/services/output-errors"
import {
  baseSourceOf,
  makeBaseBackground,
} from "@/lib/broadcast/base-background"
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
import { useBroadcastStore, useCountdownStore } from "@/stores"
import { useMediaStore } from "@/stores/media-store"
import { MonitorIcon, CastIcon, LayersIcon, ImageIcon } from "lucide-react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { open as openFileDialog } from "@tauri-apps/plugin-dialog"
import {
  SolidControls,
  GradientControls,
} from "@/components/shared/gradient-controls"
import type { Background, BaseBackground } from "@/types/broadcast"
import type { MediaAsset } from "@/types/media"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { OutputManager } from "@/components/broadcast/output-manager"
import { OutputCard } from "@/components/broadcast/output-card"
import { useOutputController } from "@/hooks/use-output-controller"

/**
 * Global base/master background editor: a theme (with branding) or a bare
 * background (solid/gradient/image/video). Writes the `BaseBackground` config the
 * store resolves and delivers to the output. Reuses the theme designer's
 * gradient/solid controls and file pickers.
 */
function BaseBackgroundSection() {
  const themes = useBroadcastStore((s) => s.themes)
  const baseBackground = useBroadcastStore((s) => s.baseBackground)
  const setBase = (bb: BaseBackground | null) =>
    useBroadcastStore.getState().setBaseBackground(bb)
  const source = baseSourceOf(baseBackground)
  const bg =
    baseBackground?.kind === "background" ? baseBackground.background : null
  const setBg = (next: Background) =>
    setBase({ kind: "background", background: next })
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)

  // Apply a chosen image/video URL to the current base background, preserving
  // any existing fit/brightness/etc. options. Library picks arrive as file
  // paths (converted here); device picks arrive already converted for images.
  const setBaseImageUrl = (url: string) => {
    if (bg?.type !== "image") return
    setBg({
      ...bg,
      image: {
        fit: "cover",
        blur: 0,
        brightness: 100,
        tint: null,
        ...(bg.image ?? {}),
        url,
      },
    })
  }
  const setBaseVideoUrl = (url: string) => {
    if (bg?.type !== "video") return
    setBg({
      ...bg,
      video: {
        fit: "cover",
        brightness: 100,
        ...(bg.video ?? {}),
        url,
      },
    })
  }

  const onSource = (v: string) => {
    if (v === "output") setBase(null)
    else if (v === "theme")
      setBase({ kind: "theme", themeId: themes[0]?.id ?? "" })
    else
      setBase({
        kind: "background",
        background: makeBaseBackground(v as Background["type"], bg),
      })
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <MonitorIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Clear &amp; Idle Background</span>
      </div>
      <p className="text-xs text-muted-foreground">
        What the audience sees when you Clear the text — and behind any content
        set to a transparent background. Applies to all outputs.
      </p>

      <label className="text-xs text-muted-foreground">
        When cleared, show
      </label>
      <Select value={source} onValueChange={onSource}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="output">
            Nothing extra — each output&apos;s own theme
          </SelectItem>
          <SelectItem value="theme">A theme…</SelectItem>
          <SelectItem value="solid">Solid color</SelectItem>
          <SelectItem value="gradient">Gradient</SelectItem>
          <SelectItem value="image">An image (logo / holding slide)</SelectItem>
          <SelectItem value="video">A video loop</SelectItem>
        </SelectContent>
      </Select>

      {source === "theme" && (
        <Select
          value={baseBackground?.kind === "theme" ? baseBackground.themeId : ""}
          onValueChange={(id) => setBase({ kind: "theme", themeId: id })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a theme" />
          </SelectTrigger>
          <SelectContent>
            {themes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {bg?.type === "solid" && (
        <SolidControls
          color={bg.color}
          onChange={(c) => setBg({ ...bg, color: c })}
        />
      )}

      {bg?.type === "gradient" && bg.gradient && (
        <GradientControls
          gradient={bg.gradient}
          onUpdate={(g) => setBg({ ...bg, gradient: g })}
        />
      )}

      {bg?.type === "image" && (
        <div className="flex items-center gap-3">
          {bg.image?.url ? (
            <div className="h-16 w-28 shrink-0 overflow-hidden rounded border border-border bg-black">
              <img
                src={bg.image.url}
                alt=""
                className="size-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-dashed border-border text-[0.625rem] text-muted-foreground">
              No image
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImagePickerOpen(true)}
          >
            {bg.image?.url ? "Change image…" : "Choose image…"}
          </Button>
        </div>
      )}

      {bg?.type === "video" && (
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-dashed border-border text-[0.625rem] text-muted-foreground">
            {bg.video?.url ? "Video set" : "No video"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVideoPickerOpen(true)}
          >
            {bg.video?.url ? "Change video…" : "Choose video…"}
          </Button>
        </div>
      )}

      {/* Library-or-device pickers for the image/video base background. The
          dialog imports device picks into the library itself, so the handlers
          only need to apply the resulting URL. */}
      <MediaPickerDialog
        open={imagePickerOpen}
        onOpenChange={setImagePickerOpen}
        mediaType="image"
        onSelect={(asset: MediaAsset) =>
          setBaseImageUrl(safeFileSrc(asset.filePath))
        }
        onSelectFromDevice={(dataUrl) => setBaseImageUrl(dataUrl)}
      />
      <MediaPickerDialog
        open={videoPickerOpen}
        onOpenChange={setVideoPickerOpen}
        mediaType="video"
        onSelect={(asset: MediaAsset) =>
          setBaseVideoUrl(safeFileSrc(asset.filePath))
        }
        onSelectFromDevice={(filePath) =>
          setBaseVideoUrl(safeFileSrc(filePath))
        }
      />
    </div>
  )
}

export function BroadcastSettings({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themes = useBroadcastStore((s) => s.themes)
  const logoImagePath = useBroadcastStore((s) => s.logoImagePath)

  // Shared (dialog-level) state — the per-output state now lives in each output
  // controller.
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [outputManagerOpen, setOutputManagerOpen] = useState(false)

  // One controller per built-in output. Each owns its enable/type/monitor/NDI
  // state, the open/toggle/NDI choreography, and its own monitor-nudge +
  // reconcile-on-open effects (all stage-aware by `output.mode`).
  const mainCtrl = useOutputController({
    outputId: "main",
    open,
    monitors,
    defaultOutputType: "display",
    defaultNdiSourceName: "LumenLive Output",
  })
  const altCtrl = useOutputController({
    outputId: "alt",
    open,
    monitors,
    defaultOutputType: "ndi",
    defaultNdiSourceName: "LumenLive Alt",
  })

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

  // When any output window announces ready, re-push all content + each output's
  // NDI config so a just-opened window isn't blank. Depends on the two push
  // callbacks (which change when either output's NDI settings change).
  const pushMainNdi = mainCtrl.pushNdiConfig
  const pushAltNdi = altCtrl.pushNdiConfig
  useEffect(() => {
    if (!open) return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const unlistenPromise = onOutputReady(() => {
      useBroadcastStore.getState().syncBroadcastOutput()
      // Re-push any live countdowns so a just-opened output isn't blank.
      useCountdownStore.getState().resyncOutputs()
      pushMainNdi()
      pushAltNdi()
      timeoutId = setTimeout(() => {
        useBroadcastStore.getState().syncBroadcastOutput()
      }, 150)
    })

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [open, pushMainNdi, pushAltNdi])

  const handleChooseLogo = async () => {
    try {
      const path = await openFileDialog({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"],
          },
        ],
      })
      if (typeof path === "string") {
        useBroadcastStore.getState().setLogoImage(path)
        void useMediaStore.getState().importPaths([path])
      }
    } catch (error) {
      reportOutputError("Couldn't choose the logo image", error)
    }
  }

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
              Configure each output's theme and layer routing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <OutputCard
              controller={mainCtrl}
              title="Main Output"
              icon={MonitorIcon}
              themes={themes}
              monitors={monitors}
              refreshing={refreshing}
              onRefreshMonitors={fetchMonitors}
              ndiSourceNamePlaceholder="LumenLive Output"
            />
            <OutputCard
              controller={altCtrl}
              title="Alternate Output"
              icon={CastIcon}
              themes={themes}
              monitors={monitors}
              refreshing={refreshing}
              onRefreshMonitors={fetchMonitors}
              ndiSourceNamePlaceholder="LumenLive Alt"
            />
          </div>

          {/* Central base / master background — global. Shown when text is
              cleared and behind any content with a transparent background. */}
          <BaseBackgroundSection />

          {/* Holding logo — a single global image shown on the audience output
              when Logo is toggled (press L or the Screen menu while live). */}
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Logo / Holding Image</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Shown full-screen on the audience output when you toggle Logo
              (press L, or the Screen menu on the Live panel, while
              broadcasting).
            </p>
            <div className="flex items-center gap-3">
              {logoImagePath ? (
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded border border-border bg-black">
                  <img
                    src={(() => {
                      try {
                        return safeFileSrc(logoImagePath)
                      } catch {
                        return logoImagePath
                      }
                    })()}
                    alt="Logo preview"
                    className="size-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-dashed border-border text-[0.625rem] text-muted-foreground">
                  No logo set
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={handleChooseLogo}>
                  {logoImagePath ? "Change image…" : "Choose image…"}
                </Button>
                {logoImagePath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() =>
                      useBroadcastStore.getState().setLogoImage(null)
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
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
