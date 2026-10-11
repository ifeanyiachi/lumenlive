import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Check, Cpu, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  OFFLINE_STT_MODEL_IDS,
  type OfflineSttModel,
} from "@/services/offline-stt-gateway"
import { useOfflineSttStore } from "@/stores/offline-stt-store"

interface OnDeviceTranscriptionRowProps {
  model: OfflineSttModel
}

export function OnDeviceTranscriptionRow({
  model,
}: OnDeviceTranscriptionRowProps) {
  const { t } = useTranslation("settings")
  const modelId = OFFLINE_STT_MODEL_IDS[model]
  const modelState = useOfflineSttStore((state) => state.models[model])
  const refreshStatus = useOfflineSttStore((state) => state.refreshStatus)
  const startDownload = useOfflineSttStore((state) => state.startDownload)
  const removeModel = useOfflineSttStore((state) => state.removeModel)
  const { status, busy, progress, error } = modelState

  useEffect(() => {
    void refreshStatus(model)
  }, [model, refreshStatus])

  if (!status) {
    return (
      <div className="border-b border-border py-5">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="border-b border-border py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <Cpu className="mt-0.5 size-5 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">
                {t("audio.onDeviceModels.english.title")}
              </h3>
              {status.installed && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="size-3.5" /> Installed
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t("audio.onDeviceModels.english.description")}
            </p>
            {busy && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${Math.max(2, progress * 100)}%` }}
                />
              </div>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          {status.installed ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void removeModel(model)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("audio.onDeviceModels.remove")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              title={t("audio.onDeviceModels.download")}
              aria-label={`${t("audio.onDeviceModels.download")} ${t(
                "audio.onDeviceModels.english.title"
              )}`}
              onClick={() => void startDownload(model)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
            </Button>
          )}
        </div>
      </div>
      <span className="sr-only">Model id: {modelId}</span>
    </div>
  )
}
