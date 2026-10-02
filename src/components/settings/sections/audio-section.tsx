import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useSettingsStore } from "@/stores"
import type { DirectVerseDestination } from "@/stores"
import type { DeviceInfo } from "@/types/audio"
import { listAudioDevices } from "@/services/audio-devices-gateway"
import { OnDeviceTranscriptionRow } from "./on-device-transcription-row"
import {
  gainToPercent,
  percentToGain,
  percentToThreshold,
  thresholdToPercent,
} from "@/lib/settings/conversions"
import { cn } from "@/lib/utils"

const DIRECT_VERSE_DESTINATIONS: readonly DirectVerseDestination[] = [
  "live",
  "preview",
  "detection",
]

type TranscriptionMode = "online" | "on-device"

function SettingRow({
  label,
  description,
  children,
  className,
}: {
  label: ReactNode
  description: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border py-5 first:pt-0 last:border-b-0 md:flex-row md:items-center md:justify-between md:gap-8",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0 shrink-0 md:ml-auto md:max-w-[58%]">{children}</div>
    </div>
  )
}

function modeForProvider(provider: string): TranscriptionMode {
  return provider === "nemotron" || provider === "nemotron35"
    ? "on-device"
    : "online"
}

export function AudioSection() {
  const { t } = useTranslation("settings")
  const {
    audioDeviceId,
    setAudioDeviceId,
    gain,
    setGain,
    transcriptionProvider,
    setTranscriptionProvider,
    confidenceThreshold,
    setConfidenceThreshold,
    cooldownMs,
    setCooldownMs,
    directVerseDestination,
    setDirectVerseDestination,
    navAutoLive,
    setNavAutoLive,
    scheduleNavAutoLive,
    setScheduleNavAutoLive,
  } = useSettingsStore()

  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listAudioDevices()
        if (!cancelled) setDevices(result)
      } catch {
        if (!cancelled) setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const gainPercent = gainToPercent(gain)
  const thresholdPercent = thresholdToPercent(confidenceThreshold)
  const mode = modeForProvider(transcriptionProvider)

  function setMode(nextMode: TranscriptionMode) {
    if (nextMode === "on-device") {
      setTranscriptionProvider("nemotron35")
    } else {
      // Preserve a previously selected online backend internally. The
      // interface intentionally presents both online services as "Online".
      setTranscriptionProvider(
        transcriptionProvider === "soniox" ? "soniox" : "cloud"
      )
    }
  }

  return (
    <div className="flex flex-col">
      <section aria-labelledby="transcription-mode-heading">
        <SettingRow
          label={
            <span id="transcription-mode-heading">
              {t("audio.modeLabel")}
            </span>
          }
          description={t("audio.modeDescription")}
        >
          <div
            className="inline-flex w-full rounded-lg border border-border bg-muted/30 p-1 md:w-auto"
            role="radiogroup"
            aria-label={t("audio.modeLabel")}
          >
            {(["online", "on-device"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => setMode(option)}
                className={cn(
                  "flex-1 rounded-md px-5 py-2 text-sm font-medium transition-colors md:flex-none",
                  mode === option
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(`audio.modes.${option}`)}
              </button>
            ))}
          </div>
        </SettingRow>

        {mode === "on-device" ? (
          <div
            className="flex flex-col"
            role="radiogroup"
            aria-label={t("audio.onDeviceModelsLabel")}
          >
            <OnDeviceTranscriptionRow
              model="nemotron"
              selected={transcriptionProvider === "nemotron"}
              onSelect={() => setTranscriptionProvider("nemotron")}
            />
            <OnDeviceTranscriptionRow
              model="nemotron35"
              selected={transcriptionProvider === "nemotron35"}
              onSelect={() => setTranscriptionProvider("nemotron35")}
            />
          </div>
        ) : null}

        <SettingRow
          label={t("audio.inputDevice")}
          description={t("audio.deviceDescription")}
        >
          <div className="w-full md:w-64 md:max-w-full">
            <Select
              value={audioDeviceId ?? "__default__"}
              onValueChange={(v) =>
                setAudioDeviceId(v === "__default__" ? null : v)
              }
              disabled={loading}
            >
              <SelectTrigger className="h-9 w-full min-w-0 text-sm">
                <SelectValue
                  placeholder={
                    loading
                      ? t("audio.loadingDevices")
                      : t("audio.systemDefault")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  {t("audio.systemDefault")}
                </SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                    {device.is_default ? t("audio.defaultDeviceSuffix") : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingRow>

        <SettingRow
          label={t("audio.inputGain.label")}
          description={t("audio.inputGain.description")}
        >
          <div className="flex w-full items-center gap-4 md:w-64">
            <Slider
              min={0}
              max={100}
              step={1}
              value={[gainPercent]}
              onValueChange={([value]) => setGain(percentToGain(value))}
              aria-label={t("audio.inputGain.label")}
            />
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
              {t("common:percent", { value: gainPercent })}
            </span>
          </div>
        </SettingRow>
      </section>

      <section className="mt-8" aria-labelledby="detection-behavior-heading">
        <div className="mb-1">
          <h3
            id="detection-behavior-heading"
            className="text-sm font-semibold text-foreground"
          >
            {t("display.detectionBehavior")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("audio.detectionDescription")}
          </p>
        </div>

        <div className="flex flex-col">
          <div className="border-b border-border py-5">
            <div className="mb-3 text-sm font-medium text-foreground">
              {t("display.directVerseDestination.title")}
            </div>
            <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {t("display.directVerseDestination.description")}
            </p>
            <RadioGroup
              value={directVerseDestination}
              onValueChange={(value) => {
                if (
                  DIRECT_VERSE_DESTINATIONS.includes(
                    value as DirectVerseDestination
                  )
                ) {
                  setDirectVerseDestination(value as DirectVerseDestination)
                }
              }}
              aria-label={t("display.directVerseDestination.title")}
              className="grid gap-2 md:grid-cols-3"
            >
              {DIRECT_VERSE_DESTINATIONS.map((destination) => (
                <label
                  key={destination}
                  htmlFor={`direct-verse-destination-${destination}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2.5 transition-colors",
                    "hover:bg-muted/60",
                    directVerseDestination === destination &&
                      "border-primary bg-primary/5"
                  )}
                >
                  <RadioGroupItem
                    value={destination}
                    id={`direct-verse-destination-${destination}`}
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium text-foreground">
                      {t(
                        `display.directVerseDestination.options.${destination}.title`
                      )}
                    </span>
                    <span className="text-[0.625rem] leading-relaxed text-muted-foreground">
                      {t(
                        `display.directVerseDestination.options.${destination}.description`
                      )}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <SettingRow
            label={t("display.voiceNavigationGoesLive.title")}
            description={t("display.voiceNavigationGoesLive.description")}
          >
            <Switch
              checked={navAutoLive}
              onCheckedChange={setNavAutoLive}
              aria-label={t("display.voiceNavigationGoesLive.title")}
            />
          </SettingRow>

          <SettingRow
            label={t("display.scheduleVoiceNavigationGoesLive.title")}
            description={t(
              "display.scheduleVoiceNavigationGoesLive.description"
            )}
          >
            <Switch
              checked={scheduleNavAutoLive}
              onCheckedChange={setScheduleNavAutoLive}
              aria-label={t("display.scheduleVoiceNavigationGoesLive.title")}
            />
          </SettingRow>

          <SettingRow
            label={t("display.confidenceThreshold.label")}
            description={t("display.confidenceThreshold.description")}
          >
            <div className="flex w-full items-center gap-4 md:w-64">
              <Slider
                min={35}
                max={100}
                step={1}
                value={[thresholdPercent]}
                onValueChange={([value]) =>
                  setConfidenceThreshold(percentToThreshold(value))
                }
                aria-label={t("display.confidenceThreshold.label")}
              />
              <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                {t("common:percent", { value: thresholdPercent })}
              </span>
            </div>
          </SettingRow>

          <SettingRow
            label={t("display.cooldown.label")}
            description={t("display.cooldown.description")}
          >
            <div className="flex w-full items-center gap-4 md:w-64">
              <Slider
                min={500}
                max={10000}
                step={250}
                value={[cooldownMs]}
                onValueChange={([value]) => setCooldownMs(value)}
                aria-label={t("display.cooldown.label")}
              />
              <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                {t("common:milliseconds", { value: cooldownMs })}
              </span>
            </div>
          </SettingRow>
        </div>
      </section>
    </div>
  )
}
