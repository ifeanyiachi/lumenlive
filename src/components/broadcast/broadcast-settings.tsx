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
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
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
import { useTranslation } from "react-i18next"

/**
 * Global base/master background editor: a theme (with branding) or a bare
 * background (solid/gradient/image/video). Writes the `BaseBackground` config the
 * store resolves and delivers to the output. Reuses the theme designer's
 * gradient/solid controls and file pickers.
 */
function BaseBackgroundSection() {
  const { t } = useTranslation("broadcast")
  const baseBackground = useBroadcastStore((s) => s.baseBackground)
  const setBase = (bb: BaseBackground | null) =>
    useBroadcastStore.getState().setBaseBackground(bb)
  // Theme is no longer an offered source; any legacy theme-kind base falls back
  // to "output" in the picker (each output's own theme), which is what a theme
  // backdrop effectively was. The resolver still honours a stored theme-kind for
  // back-compat until the operator picks a new source here.
  const rawSource = baseSourceOf(baseBackground)
  const source = rawSource === "theme" ? "output" : rawSource
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
        <span className="text-sm font-medium">{t("clearIdleBackground")}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("clearIdleDescription")}
      </p>

      <label className="text-xs text-muted-foreground">
        {t("whenClearedShow")}
      </label>
      <Select value={source} onValueChange={onSource}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="output">{t("outputTheme")}</SelectItem>
          <SelectItem value="solid">{t("solidColor")}</SelectItem>
          <SelectItem value="gradient">{t("gradient")}</SelectItem>
          <SelectItem value="image">{t("imageHoldingSlide")}</SelectItem>
          <SelectItem value="video">{t("videoLoop")}</SelectItem>
        </SelectContent>
      </Select>

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
              {t("noImage")}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImagePickerOpen(true)}
          >
            {bg.image?.url ? t("changeImage") : t("chooseImage")}
          </Button>
        </div>
      )}

      {bg?.type === "video" && (
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-dashed border-border text-[0.625rem] text-muted-foreground">
            {bg.video?.url ? t("videoSet") : t("noVideo")}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVideoPickerOpen(true)}
          >
            {bg.video?.url ? t("changeVideo") : t("chooseVideo")}
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
  const { t } = useTranslation("broadcast")
  // Each output renders scripture, so its theme picker lists scripture-type themes.
  const customThemes = useThemesStore((s) => s.customThemes)
  const themes = buildThemeRegistry(customThemes).filter(
    (t) => t.type === "scripture"
  )
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
              <DialogTitle>{t("title")}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setOutputManagerOpen(true)}
              >
                <LayersIcon className="size-3.5" />
                {t("manageOutputs")}
              </Button>
            </div>
            <DialogDescription>{t("configureOutputs")}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <OutputCard
              controller={mainCtrl}
              title={t("mainOutput")}
              icon={MonitorIcon}
              themes={themes}
              monitors={monitors}
              refreshing={refreshing}
              onRefreshMonitors={fetchMonitors}
              ndiSourceNamePlaceholder="LumenLive Output"
            />
            <OutputCard
              controller={altCtrl}
              title={t("alternateOutput")}
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
              when Logo is toggled with its live-output shortcut. */}
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("holdingImage")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("holdingImageDescription")}
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
                    alt={t("logoPreview")}
                    className="size-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded border border-dashed border-border text-[0.625rem] text-muted-foreground">
                  {t("noLogo")}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={handleChooseLogo}>
                  {logoImagePath ? t("changeImage") : t("chooseImage")}
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
                    {t("remove")}
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
