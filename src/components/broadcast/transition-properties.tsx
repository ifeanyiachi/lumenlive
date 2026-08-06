import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlayIcon } from "lucide-react"

const TRANSITION_TYPES = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "scale", label: "Scale" },
] as const

const EASING_OPTIONS = [
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-in-out", label: "Ease In-Out" },
  { value: "linear", label: "Linear" },
] as const

const DIRECTION_OPTIONS = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const

export function TransitionProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const transition = draftTheme.transition

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between pb-1">
        <div className="flex flex-col gap-0.5">
          <h4 className="text-xs font-semibold">Verse Transition</h4>
          <p className="text-[11px] text-muted-foreground">
            How verses animate when changing
          </p>
        </div>
        {transition.type !== "none" && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              useBroadcastStore.getState().triggerTransitionPreview()
            }
          >
            <PlayIcon className="size-3" />
            Preview
          </Button>
        )}
      </div>

      {/* Transition Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Type
        </label>
        <Select
          value={transition.type}
          onValueChange={(v) => update("transition.type", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSITION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {transition.type !== "none" && (
        <>
          {/* Duration */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Duration
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {transition.duration}ms
              </span>
            </div>
            <Slider
              min={100}
              max={2000}
              step={50}
              value={[transition.duration]}
              onValueChange={([v]) => update("transition.duration", v)}
            />
          </div>

          {/* Easing */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Easing
            </label>
            <Select
              value={transition.easing}
              onValueChange={(v) => update("transition.easing", v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EASING_OPTIONS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Direction (only for slide) */}
          {transition.type === "slide" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Direction
              </label>
              <Select
                value={transition.direction}
                onValueChange={(v) => update("transition.direction", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  )
}
