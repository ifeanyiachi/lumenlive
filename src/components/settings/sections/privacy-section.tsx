import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

import { ToggleCard } from "../ui/toggle-card"

export function PrivacySection() {
  const { t } = useTranslation("settings")
  const telemetryEnabled = useSettingsStore((s) => s.telemetryEnabled)
  const setTelemetryEnabled = useSettingsStore((s) => s.setTelemetryEnabled)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("privacy.anonymousUsageData")}
        </label>

        <ToggleCard
          title={t("privacy.shareUsage.title")}
          description={t("privacy.shareUsage.description")}
          checked={telemetryEnabled}
          onCheckedChange={setTelemetryEnabled}
        />

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("privacy.collection.title")}
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("privacy.collection.collected")}
            </span>{" "}
            {t("privacy.collection.collectedDescription")}
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("privacy.collection.neverCollected")}
            </span>{" "}
            {t("privacy.collection.neverCollectedDescription")}
          </p>
        </div>
      </div>
    </div>
  )
}
