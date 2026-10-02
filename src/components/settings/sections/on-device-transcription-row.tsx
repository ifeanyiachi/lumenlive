import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, Cpu, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  getOfflineSttStatus,
  installOfflineSttModel,
  onOfflineSttInstallProgress,
  removeOfflineSttModel,
  OFFLINE_STT_MODEL_IDS,
  type OfflineSttModel,
  type OfflineSttModelStatus,
} from "@/services/offline-stt-gateway"

interface OnDeviceTranscriptionRowProps {
  model: OfflineSttModel
  selected: boolean
  onSelect: () => void
}

const MODEL_LOADERS: Record<
  OfflineSttModel,
  {
    get: () => Promise<OfflineSttModelStatus>
    install: () => Promise<OfflineSttModelStatus>
    remove: () => Promise<void>
  }
> = {
  nemotron: {
    get: () => getOfflineSttStatus("nemotron"),
    install: () => installOfflineSttModel("nemotron"),
    remove: () => removeOfflineSttModel("nemotron"),
  },
  nemotron35: {
    get: () => getOfflineSttStatus("nemotron35"),
    install: () => installOfflineSttModel("nemotron35"),
    remove: () => removeOfflineSttModel("nemotron35"),
  },
}

export function OnDeviceTranscriptionRow({
  model,
  selected,
  onSelect,
}: OnDeviceTranscriptionRowProps) {
  const { t } = useTranslation("settings")
  const modelId = OFFLINE_STT_MODEL_IDS[model]
  const loaders = MODEL_LOADERS[model]
  const [status, setStatus] = useState<OfflineSttModelStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loaders
      .get()
      .then(setStatus)
      .catch((e) => setError(String(e)))
    let active = true
    let dispose: (() => void) | undefined
    void onOfflineSttInstallProgress((event) => {
      if (!active || event.total <= 0) return
      setProgress(Math.min(1, event.received / event.total))
    }, modelId).then((cleanup) => {
      if (active) dispose = cleanup
      else cleanup()
    })
    return () => {
      active = false
      dispose?.()
    }
  }, [loaders, modelId])

  async function install() {
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      setStatus(await loaders.install())
      setProgress(1)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await loaders.remove()
      setStatus((current) =>
        current ? { ...current, installed: false } : current
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

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
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <Cpu className="mt-0.5 size-5 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={
                  selected
                    ? "text-sm font-semibold text-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {model === "nemotron"
                  ? t("audio.onDeviceModels.english.title")
                  : t("audio.onDeviceModels.multilingual.title")}
              </h3>
              {status.installed && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="size-3.5" /> Installed
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {model === "nemotron"
                ? t("audio.onDeviceModels.english.description")
                : t("audio.onDeviceModels.multilingual.description")}
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
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
          <Button
            variant={selected ? "secondary" : "outline"}
            size="sm"
            disabled={selected || busy}
            onClick={onSelect}
          >
            {selected && <Check />}
            {selected
              ? t("audio.onDeviceModels.active")
              : t("audio.onDeviceModels.setActive")}
          </Button>
          <Button
            variant={status.installed ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={() => void (status.installed ? remove() : install())}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : status.installed ? (
              <Trash2 />
            ) : (
              <Download />
            )}
            {status.installed
              ? t("audio.onDeviceModels.remove")
              : t("audio.onDeviceModels.download")}
          </Button>
        </div>
      </div>
      <span className="sr-only">Model id: {modelId}</span>
    </div>
  )
}
