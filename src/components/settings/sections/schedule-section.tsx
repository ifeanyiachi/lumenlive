import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

import { ToggleCard } from "../ui/toggle-card"

export function ScheduleSection() {
  const { t } = useTranslation("settings")
  const preventDuplicateScheduleItems = useSettingsStore(
    (s) => s.preventDuplicateScheduleItems
  )
  const setPreventDuplicateScheduleItems = useSettingsStore(
    (s) => s.setPreventDuplicateScheduleItems
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("schedule.building")}
        </label>

        <ToggleCard
          title={t("schedule.preventDuplicates.title")}
          description={t("schedule.preventDuplicates.description")}
          checked={preventDuplicateScheduleItems}
          onCheckedChange={setPreventDuplicateScheduleItems}
        />

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("schedule.guidance.title")}
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("schedule.guidance.leaveOn")}
            </span>{" "}
            {t("schedule.guidance.leaveOnDescription")}
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("schedule.guidance.turnOff")}
            </span>{" "}
            {t("schedule.guidance.turnOffDescription")}
          </p>
        </div>
      </div>
    </div>
  )
}
