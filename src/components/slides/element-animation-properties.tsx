import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { usePresentationStore } from "@/stores/presentation-store"
import { PropertyRow } from "@/components/shared/property-row"
import type {
  SlideElement,
  ElementAnimation,
  ElementAnimationType,
  TextBuildAnimation,
  TextBuildType,
  ScrollingConfig,
} from "@/types/slide"

const ANIMATION_TYPES: { value: ElementAnimationType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "scale", label: "Scale" },
]

const EASING_OPTIONS: { value: string; label: string }[] = [
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-in-out", label: "Ease In-Out" },
  { value: "linear", label: "Linear" },
]

function AnimationSection({
  title,
  anim,
  onChange,
}: {
  title: string
  anim: ElementAnimation | undefined
  onChange: (anim: ElementAnimation | undefined) => void
}) {
  const current: ElementAnimation = anim ?? {
    type: "none",
    duration: 500,
    delay: 0,
    easing: "ease-out",
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {title}
        </span>
      </div>
      <PropertyRow label="Type">
        <select
          className="h-6 w-full rounded border border-border bg-card px-1 text-[0.6875rem]"
          value={current.type}
          onChange={(e) => {
            const type = e.target.value as ElementAnimationType
            if (type === "none") {
              onChange(undefined)
            } else {
              onChange({ ...current, type })
            }
          }}
        >
          {ANIMATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </PropertyRow>
      {current.type !== "none" && (
        <>
          <PropertyRow label="Duration">
            <div className="flex items-center gap-1">
              <Slider
                value={[current.duration]}
                onValueChange={([v]) => onChange({ ...current, duration: v })}
                min={100}
                max={3000}
                step={50}
              />
              <span className="w-10 text-right text-[0.5625rem] text-muted-foreground">
                {current.duration}ms
              </span>
            </div>
          </PropertyRow>
          <PropertyRow label="Delay">
            <div className="flex items-center gap-1">
              <Slider
                value={[current.delay]}
                onValueChange={([v]) => onChange({ ...current, delay: v })}
                min={0}
                max={3000}
                step={50}
              />
              <span className="w-10 text-right text-[0.5625rem] text-muted-foreground">
                {current.delay}ms
              </span>
            </div>
          </PropertyRow>
          <PropertyRow label="Easing">
            <select
              className="h-6 w-full rounded border border-border bg-card px-1 text-[0.6875rem]"
              value={current.easing}
              onChange={(e) =>
                onChange({
                  ...current,
                  easing: e.target.value as ElementAnimation["easing"],
                })
              }
            >
              {EASING_OPTIONS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </PropertyRow>
        </>
      )}
    </div>
  )
}

export function ElementAnimationProperties({
  element,
}: {
  element: SlideElement
}) {
  const update = (updates: Partial<SlideElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const anim = element.animation

  return (
    <>
      <Separator />
      <AnimationSection
        title="Entry Animation"
        anim={anim?.entry}
        onChange={(entry) => {
          update({
            animation: entry ? { ...anim, entry } : { exit: anim?.exit },
          })
        }}
      />
      <AnimationSection
        title="Exit Animation"
        anim={anim?.exit}
        onChange={(exit) => {
          update({
            animation: exit ? { ...anim, exit } : { entry: anim?.entry },
          })
        }}
      />
    </>
  )
}

export function TextBuildProperties({
  element,
}: {
  element: { id: string; textBuild?: TextBuildAnimation }
}) {
  const update = (updates: Record<string, unknown>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const build: TextBuildAnimation = element.textBuild ?? {
    type: "none",
    duration: 300,
    delay: 0,
  }

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Text Build
        </span>
        <PropertyRow label="Type">
          <select
            className="h-6 w-full rounded border border-border bg-card px-1 text-[0.6875rem]"
            value={build.type}
            onChange={(e) => {
              const type = e.target.value as TextBuildType
              if (type === "none") {
                update({ textBuild: undefined })
              } else {
                update({ textBuild: { ...build, type } })
              }
            }}
          >
            <option value="none">None</option>
            <option value="line-by-line">Line by Line</option>
            <option value="word-by-word">Word by Word</option>
          </select>
        </PropertyRow>
        {build.type !== "none" && (
          <>
            <PropertyRow label="Duration">
              <div className="flex items-center gap-1">
                <Slider
                  value={[build.duration]}
                  onValueChange={([v]) =>
                    update({ textBuild: { ...build, duration: v } })
                  }
                  min={100}
                  max={2000}
                  step={50}
                />
                <span className="w-10 text-right text-[0.5625rem] text-muted-foreground">
                  {build.duration}ms
                </span>
              </div>
            </PropertyRow>
            <PropertyRow label="Delay">
              <div className="flex items-center gap-1">
                <Slider
                  value={[build.delay]}
                  onValueChange={([v]) =>
                    update({ textBuild: { ...build, delay: v } })
                  }
                  min={0}
                  max={2000}
                  step={50}
                />
                <span className="w-10 text-right text-[0.5625rem] text-muted-foreground">
                  {build.delay}ms
                </span>
              </div>
            </PropertyRow>
          </>
        )}
      </div>
    </>
  )
}

export function ScrollingTextProperties({
  element,
}: {
  element: { id: string; scrolling?: ScrollingConfig }
}) {
  const update = (updates: Record<string, unknown>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const scrolling = element.scrolling
  const isEnabled = !!scrolling

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            Scrolling
          </span>
          <Button
            variant={isEnabled ? "default" : "outline"}
            size="icon-sm"
            className="size-5 text-[0.5625rem]"
            onClick={() =>
              update({
                scrolling: isEnabled
                  ? undefined
                  : { speed: 50, direction: "up" as const },
              })
            }
          >
            {isEnabled ? "On" : "Off"}
          </Button>
        </div>
        {scrolling && (
          <>
            <PropertyRow label="Speed">
              <Slider
                value={[scrolling.speed]}
                onValueChange={([v]) =>
                  update({ scrolling: { ...scrolling, speed: v } })
                }
                min={10}
                max={200}
                step={5}
              />
            </PropertyRow>
            <PropertyRow label="Direction">
              <select
                className="h-6 w-full rounded border border-border bg-card px-1 text-[0.6875rem]"
                value={scrolling.direction}
                onChange={(e) =>
                  update({
                    scrolling: {
                      ...scrolling,
                      direction: e.target.value as "up" | "down",
                    },
                  })
                }
              >
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </PropertyRow>
          </>
        )}
      </div>
    </>
  )
}

export function ShapeMaskProperties({
  element,
  elements,
}: {
  element: { id: string; maskTargetId?: string }
  elements: SlideElement[]
}) {
  const update = (updates: Record<string, unknown>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const maskableElements = elements.filter(
    (el) => el.id !== element.id && (el.type === "image" || el.type === "video")
  )

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          Mask Target
        </span>
        <select
          className="h-7 w-full rounded border border-border bg-card px-2 text-xs"
          value={element.maskTargetId ?? ""}
          onChange={(e) =>
            update({ maskTargetId: e.target.value || undefined })
          }
        >
          <option value="">None (draw normally)</option>
          {maskableElements.map((el) => (
            <option key={el.id} value={el.id}>
              {el.type === "image" ? "Image" : "Video"} — {el.id.slice(0, 8)}
            </option>
          ))}
        </select>
        <p className="text-[0.5625rem] text-muted-foreground">
          When set, this shape clips the selected image or video element.
        </p>
      </div>
    </>
  )
}
