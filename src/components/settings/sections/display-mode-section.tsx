import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"
import {
  thresholdToPercent,
  percentToThreshold,
} from "@/lib/settings/conversions"

import { ToggleCard } from "../ui/toggle-card"
import { SectionSlider } from "../ui/section-slider"

export function DisplayModeSection() {
  const { t } = useTranslation("settings")
  const {
    confidenceThreshold,
    setConfidenceThreshold,
    cooldownMs,
    setCooldownMs,
    directAutoDisplay,
    setDirectAutoDisplay,
    directInstantDisplay,
    setDirectInstantDisplay,
    navAutoLive,
    setNavAutoLive,
    scheduleNavAutoLive,
    setScheduleNavAutoLive,
  } = useSettingsStore()

  const thresholdPercent = thresholdToPercent(confidenceThreshold)

  return (
    <div className="flex flex-col gap-6">
      {/* Detection behavior toggles */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("display.detectionBehavior")}
        </label>

        <div className="flex flex-col gap-3">
          <ToggleCard
            title={t("display.directVerseAutoDisplay.title")}
            description={t("display.directVerseAutoDisplay.description")}
            checked={directAutoDisplay}
            onCheckedChange={setDirectAutoDisplay}
          />

          {directAutoDisplay && (
            <div className="ml-3 border-l pl-3">
              <ToggleCard
                title={t("display.instantDirectDisplay.title")}
                description={t("display.instantDirectDisplay.description")}
                checked={directInstantDisplay}
                onCheckedChange={setDirectInstantDisplay}
              />
            </div>
          )}

          <ToggleCard
            title={t("display.voiceNavigationGoesLive.title")}
            description={t("display.voiceNavigationGoesLive.description")}
            checked={navAutoLive}
            onCheckedChange={setNavAutoLive}
          />

          <ToggleCard
            title={t("display.scheduleVoiceNavigationGoesLive.title")}
            description={t(
              "display.scheduleVoiceNavigationGoesLive.description"
            )}
            checked={scheduleNavAutoLive}
            onCheckedChange={setScheduleNavAutoLive}
          />
        </div>
      </div>

      {/* Confidence threshold */}
      <SectionSlider
        label={t("display.confidenceThreshold.label")}
        valueLabel={t("common:percent", { value: thresholdPercent })}
        min={35}
        max={100}
        step={1}
        value={thresholdPercent}
        onValueChange={(v) => setConfidenceThreshold(percentToThreshold(v))}
        description={t("display.confidenceThreshold.description")}
      />

      {/* Cooldown */}
      <SectionSlider
        label={t("display.cooldown.label")}
        valueLabel={t("common:milliseconds", { value: cooldownMs })}
        min={500}
        max={10000}
        step={250}
        value={cooldownMs}
        onValueChange={(v) => setCooldownMs(v)}
        description={t("display.cooldown.description")}
      />
    </div>
  )
}
