import { useState } from "react"
import { MonitorIcon, ImageIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { open as openFileDialog } from "@tauri-apps/plugin-dialog"
import {
  baseSourceOf,
  makeBaseBackground,
} from "@/lib/broadcast/base-background"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  SolidControls,
  GradientControls,
} from "@/components/shared/gradient-controls"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { useBroadcastStore } from "@/stores"
import { useMediaStore } from "@/stores/media-store"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { reportOutputError } from "@/services/output-errors"
import type { Background, BaseBackground } from "@/types/broadcast"
import type { MediaAsset } from "@/types/media"

/** Left label column + right control column, so every global row aligns. */
function GlobalRow({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,19rem)_1fr] md:gap-8">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ClearIdleBackground() {
  const { t } = useTranslation("broadcast")
  const baseBackground = useBroadcastStore((s) => s.baseBackground)
  const setBase = (bb: BaseBackground | null) =>
    useBroadcastStore.getState().setBaseBackground(bb)
  const rawSource = baseSourceOf(baseBackground)
  const source = rawSource === "theme" ? "output" : rawSource
  const bg =
    baseBackground?.kind === "background" ? baseBackground.background : null
  const setBg = (next: Background) =>
    setBase({ kind: "background", background: next })
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)

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
      video: { fit: "cover", brightness: 100, ...(bg.video ?? {}), url },
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
    <GlobalRow
      icon={<MonitorIcon className="size-4 text-muted-foreground" />}
      title={t("clearIdleBackground")}
      description={t("clearIdleDescription")}
    >
      <div className="space-y-3">
        <Select value={source} onValueChange={onSource}>
          <SelectTrigger className="w-full max-w-xs">
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
      </div>

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
        onSelectFromDevice={(filePath) => setBaseVideoUrl(safeFileSrc(filePath))}
      />
    </GlobalRow>
  )
}

function HoldingImage() {
  const { t } = useTranslation("broadcast")
  const logoImagePath = useBroadcastStore((s) => s.logoImagePath)

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
    <GlobalRow
      icon={<ImageIcon className="size-4 text-muted-foreground" />}
      title={t("holdingImage")}
      description={t("holdingImageDescription")}
    >
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
              onClick={() => useBroadcastStore.getState().setLogoImage(null)}
            >
              {t("remove")}
            </Button>
          )}
        </div>
      </div>
    </GlobalRow>
  )
}

/** The "Global" tab: settings shared by every output. */
export function GlobalSettings() {
  return (
    <div className="h-full space-y-8 overflow-y-auto p-6">
      <ClearIdleBackground />
      <div className="h-px bg-border/70" />
      <HoldingImage />
    </div>
  )
}
