import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore } from "@/stores"
import type { DeviceInfo } from "@/types/audio"
import { listAudioDevices } from "@/services/audio-devices-gateway"
import { gainToPercent, percentToGain } from "@/lib/settings/conversions"

import { SectionSlider } from "../ui/section-slider"

export function AudioSection() {
  const { t } = useTranslation("settings")
  const { audioDeviceId, setAudioDeviceId, gain, setGain } = useSettingsStore()

  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch devices on mount. All state updates happen after the await (never
  // synchronously in the effect body), and are guarded against a late resolve
  // after unmount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await listAudioDevices()
        if (!cancelled) setDevices(result)
      } catch {
        // Tauri command may not be available during dev
        if (!cancelled) setDevices([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // gain is 0.0-2.0 in store, display as 0-100%
  const gainPercent = gainToPercent(gain)

  return (
    <div className="flex flex-col gap-6">
      {/* Device selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("audio.inputDevice")}
        </label>
        <Select
          value={audioDeviceId ?? "__default__"}
          onValueChange={(v) =>
            setAudioDeviceId(v === "__default__" ? null : v)
          }
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                loading ? t("audio.loadingDevices") : t("audio.systemDefault")
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
        <p className="text-[0.625rem] text-muted-foreground">
          {t("audio.deviceDescription")}
        </p>
      </div>

      {/* Input gain */}
      <SectionSlider
        label={t("audio.inputGain.label")}
        valueLabel={t("common:percent", { value: gainPercent })}
        min={0}
        max={100}
        step={1}
        value={gainPercent}
        onValueChange={(v) => setGain(percentToGain(v))}
        description={t("audio.inputGain.description")}
      />
    </div>
  )
}
