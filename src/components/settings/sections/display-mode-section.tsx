import { useSettingsStore } from "@/stores"
import {
  thresholdToPercent,
  percentToThreshold,
} from "@/lib/settings/conversions"

import { ToggleCard } from "../ui/toggle-card"
import { SectionSlider } from "../ui/section-slider"

export function DisplayModeSection() {
  const {
    confidenceThreshold,
    setConfidenceThreshold,
    cooldownMs,
    setCooldownMs,
    directAutoDisplay,
    setDirectAutoDisplay,
    directInstantDisplay,
    setDirectInstantDisplay,
    semanticAutoQueue,
    setSemanticAutoQueue,
    navAutoLive,
    setNavAutoLive,
  } = useSettingsStore()

  const thresholdPercent = thresholdToPercent(confidenceThreshold)

  return (
    <div className="flex flex-col gap-6">
      {/* Detection behavior toggles */}
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Detection Behavior
        </label>

        <div className="flex flex-col gap-3">
          <ToggleCard
            title="Direct verse auto-display"
            description='When a verse reference like "John 3:16" is spoken, automatically display it on screen. When off, it only appears in the queue.'
            checked={directAutoDisplay}
            onCheckedChange={setDirectAutoDisplay}
          />

          {directAutoDisplay && (
            <div className="ml-3 border-l pl-3">
              <ToggleCard
                title="Instant direct display"
                description="Display a spoken reference the moment it's recognized, instead of waiting for the sentence to finish (removes the ~1-2s pause). Applies only to direct references; the verse is confirmed as you keep speaking."
                checked={directInstantDisplay}
                onCheckedChange={setDirectInstantDisplay}
              />
            </div>
          )}

          <ToggleCard
            title="Semantic verse auto-queue"
            description='When a verse is detected from spoken content (e.g. "And God so loved the world"), automatically add it to the queue. When off, semantic detections only appear in the AI Detections panel.'
            checked={semanticAutoQueue}
            onCheckedChange={setSemanticAutoQueue}
          />

          <ToggleCard
            title="Voice navigation goes live"
            description='When you say "turn to the next verse" or "go back one verse", push the target straight to the audience. When off (default), it is staged to Program preview for you to take.'
            checked={navAutoLive}
            onCheckedChange={setNavAutoLive}
          />
        </div>
      </div>

      {/* Confidence threshold */}
      <SectionSlider
        label="Confidence Threshold"
        valueLabel={`${thresholdPercent}%`}
        min={35}
        max={100}
        step={1}
        value={thresholdPercent}
        onValueChange={(v) => setConfidenceThreshold(percentToThreshold(v))}
        description="Minimum confidence required for auto-display and auto-queue. Applies to both direct and semantic detections. Higher values reduce false positives."
      />

      {/* Cooldown */}
      <SectionSlider
        label="Cooldown"
        valueLabel={`${cooldownMs}ms`}
        min={500}
        max={10000}
        step={250}
        value={cooldownMs}
        onValueChange={(v) => setCooldownMs(v)}
        description="Minimum time between auto-displayed detections. Prevents rapid flickering when multiple verses are detected in quick succession."
      />
    </div>
  )
}
