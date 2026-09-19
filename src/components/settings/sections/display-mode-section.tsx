import { type DirectVerseDestination, useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
  thresholdToPercent,
  percentToThreshold,
} from "@/lib/settings/conversions"

import { ToggleCard } from "../ui/toggle-card"
import { SectionSlider } from "../ui/section-slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const DIRECT_VERSE_DESTINATIONS: readonly DirectVerseDestination[] = [
  "live",
  "preview",
  "detection",
]

export function DisplayModeSection() {
  const { t } = useTranslation("settings")
  const {
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

  const thresholdPercent = thresholdToPercent(confidenceThreshold)

  return (
    <div className="flex flex-col gap-6">
      {/* Detection behavior toggles */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("display.detectionBehavior")}
        </label>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">
                {t("display.directVerseDestination.title")}
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                {t("display.directVerseDestination.description")}
              </p>
            </div>

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
              className="mt-3 gap-2"
            >
              {DIRECT_VERSE_DESTINATIONS.map((destination) => (
                <label
                  key={destination}
                  htmlFor={`direct-verse-destination-${destination}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
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
