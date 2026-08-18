import { useBroadcastStore } from "@/stores/broadcast-store"
import { GradientControls as SharedGradientControls } from "@/components/shared/gradient-controls"
import type { GradientValue } from "@/components/shared/gradient-controls"

export function GradientSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.gradient) return null

  const gradient = draftTheme.background.gradient
  const sharedGradient: GradientValue = {
    type: gradient.type,
    angle: gradient.angle,
    stops: gradient.stops.map((s) => ({
      color: s.color,
      position: s.position,
    })),
  }

  return (
    <SharedGradientControls
      gradient={sharedGradient}
      onUpdate={(g) => {
        update("background.gradient", {
          type: g.type,
          angle: g.angle,
          stops: g.stops.map((s) => ({ color: s.color, position: s.position })),
        })
      }}
    />
  )
}
