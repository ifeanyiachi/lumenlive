import { useSettingsStore } from "@/stores"

import { ToggleCard } from "../ui/toggle-card"

export function PrivacySection() {
  const telemetryEnabled = useSettingsStore((s) => s.telemetryEnabled)
  const setTelemetryEnabled = useSettingsStore((s) => s.setTelemetryEnabled)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Anonymous Usage Data
        </label>

        <ToggleCard
          title="Share anonymous usage data"
          description="Help improve LumenLive by sending anonymous, aggregate usage data — which features are used and how often the app runs a service. This never includes scripture text, song lyrics, media, church or service names, or anything that identifies you. You can turn it off at any time."
          checked={telemetryEnabled}
          onCheckedChange={setTelemetryEnabled}
        />

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            What is and isn't collected
          </span>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Collected:</span>{" "}
            counts of events like the app launching, a service starting, going
            live, and which features get used — plus your app version and
            operating system. It helps us see which parts of LumenLive matter to
            churches and where to focus.
          </p>
          <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Never collected:</span>{" "}
            your identity, your church, verse or song content, file paths,
            screenshots, or anything you type. There is no account and no
            tracking across other apps.
          </p>
        </div>
      </div>
    </div>
  )
}
