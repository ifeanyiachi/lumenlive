import { useBroadcastStore } from "@/stores/broadcast-store"
import { SolidControls as SharedSolidControls } from "@/components/shared/gradient-controls"

export function SolidSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Background Color
      </label>
      <SharedSolidControls
        color={draftTheme.background.color}
        onChange={(color) => update("background.color", color)}
      />
    </div>
  )
}
