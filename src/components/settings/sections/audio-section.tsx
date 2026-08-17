import { useState, useEffect } from "react"

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
          Input Device
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
              placeholder={loading ? "Loading devices..." : "System default"}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__default__">System default</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id}>
                {device.name}
                {device.is_default ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          Selected device persists across sessions. Leave as system default to
          follow OS audio routing.
        </p>
      </div>

      {/* Input gain */}
      <SectionSlider
        label="Input Gain"
        valueLabel={`${gainPercent}%`}
        min={0}
        max={100}
        step={1}
        value={gainPercent}
        onValueChange={(v) => setGain(percentToGain(v))}
        description="Amplifies the incoming audio signal before transcription. 50% is unity gain."
      />
    </div>
  )
}
