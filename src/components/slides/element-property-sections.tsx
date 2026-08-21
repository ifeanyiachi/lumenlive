import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { cn } from "@/lib/utils"

/**
 * Shared property-panel sections for the slide/theme element editors. Extracted so
 * every element type (text, scripture, timer, shape, image, video) offers the SAME
 * Shadow, Outline, and Position/alignment controls instead of each panel
 * re-implementing (and drifting from) them.
 */

export type ElementShadow = {
  offsetX: number
  offsetY: number
  blur: number
  color: string
}
export type ElementOutline = { width: number; color: string }
export type BoxRect = { x: number; y: number; width: number; height: number }

const DEFAULT_SHADOW: ElementShadow = {
  offsetX: 2,
  offsetY: 2,
  blur: 4,
  color: "rgba(0,0,0,0.5)",
}
const DEFAULT_OUTLINE: ElementOutline = { width: 2, color: "#000000" }

export function PropertyRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function SectionHeader({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <Button
        variant={on ? "default" : "outline"}
        size="icon-sm"
        className="size-5 text-[0.5625rem]"
        onClick={onToggle}
      >
        {on ? "On" : "Off"}
      </Button>
    </div>
  )
}

function ColorRow({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <PropertyRow label="Color">
      <div className="flex items-center gap-2">
        <ColorSwatch
          value={value.startsWith("rgba") ? "#000000" : value}
          onChange={onChange}
          className="size-7"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
      </div>
    </PropertyRow>
  )
}

/** Drop-shadow controls (offset X/Y, blur, color) with an on/off toggle. */
export function ShadowSection({
  shadow,
  onChange,
}: {
  shadow: ElementShadow | undefined
  onChange: (shadow: ElementShadow | undefined) => void
}) {
  const s = shadow ?? DEFAULT_SHADOW
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        label="Shadow"
        on={!!shadow}
        onToggle={() => onChange(shadow ? undefined : DEFAULT_SHADOW)}
      />
      {shadow && (
        <>
          <PropertyRow label="Offset X">
            <Slider
              value={[s.offsetX]}
              onValueChange={([v]) => onChange({ ...s, offsetX: v })}
              min={-20}
              max={20}
              step={1}
            />
          </PropertyRow>
          <PropertyRow label="Offset Y">
            <Slider
              value={[s.offsetY]}
              onValueChange={([v]) => onChange({ ...s, offsetY: v })}
              min={-20}
              max={20}
              step={1}
            />
          </PropertyRow>
          <PropertyRow label="Blur">
            <Slider
              value={[s.blur]}
              onValueChange={([v]) => onChange({ ...s, blur: v })}
              min={0}
              max={50}
              step={1}
            />
          </PropertyRow>
          <ColorRow value={s.color} onChange={(color) => onChange({ ...s, color })} />
        </>
      )}
    </div>
  )
}

/** Text-outline controls (width, color) with an on/off toggle. */
export function OutlineSection({
  outline,
  onChange,
}: {
  outline: ElementOutline | undefined
  onChange: (outline: ElementOutline | undefined) => void
}) {
  const on = !!outline && outline.width > 0
  const o = outline ?? DEFAULT_OUTLINE
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        label="Outline"
        on={on}
        onToggle={() => onChange(on ? undefined : DEFAULT_OUTLINE)}
      />
      {on && (
        <>
          <PropertyRow label="Width">
            <Slider
              value={[o.width]}
              onValueChange={([v]) => onChange({ ...o, width: v })}
              min={1}
              max={20}
              step={1}
            />
          </PropertyRow>
          <ColorRow value={o.color} onChange={(color) => onChange({ ...o, color })} />
        </>
      )}
    </div>
  )
}

// 3×3 element-alignment snap: each cell positions the element box against the slide
// edges/center, deriving x/y from the box's own width/height (percent units).
const H_ALIGN = [
  { key: "left", label: "left", x: () => 0 },
  { key: "center", label: "center", x: (w: number) => (100 - w) / 2 },
  { key: "right", label: "right", x: (w: number) => 100 - w },
] as const
const V_ALIGN = [
  { key: "top", label: "top", y: () => 0 },
  { key: "middle", label: "middle", y: (h: number) => (100 - h) / 2 },
  { key: "bottom", label: "bottom", y: (h: number) => 100 - h },
] as const

function AlignmentGrid({
  rect,
  onChange,
}: {
  rect: BoxRect
  onChange: (patch: Partial<BoxRect>) => void
}) {
  const round = (n: number) => Math.round(n * 10) / 10
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.625rem] text-muted-foreground">Align</span>
      <div className="grid w-fit grid-cols-3 gap-1">
        {V_ALIGN.map((v) =>
          H_ALIGN.map((h) => {
            const tx = round(h.x(rect.width))
            const ty = round(v.y(rect.height))
            const active =
              Math.abs(rect.x - tx) < 0.5 && Math.abs(rect.y - ty) < 0.5
            return (
              <button
                key={`${v.key}-${h.key}`}
                type="button"
                title={`${v.label} ${h.label}`}
                onClick={() => onChange({ x: tx, y: ty })}
                className={cn(
                  "flex size-6 items-center justify-center rounded border transition-colors",
                  active
                    ? "border-primary bg-primary/15"
                    : "border-border hover:border-muted-foreground/50 hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "block size-1.5 rounded-full",
                    active ? "bg-primary" : "bg-muted-foreground/50"
                  )}
                />
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

/** X/Y/W/H numeric inputs plus the 3×3 element-alignment snap grid. */
export function PositionSizeSection({
  rect,
  onChange,
}: {
  rect: BoxRect
  onChange: (patch: Partial<BoxRect>) => void
}) {
  const num = (key: keyof BoxRect, min: number) => (
    <Input
      type="number"
      value={rect[key]}
      onChange={(e) => onChange({ [key]: Number(e.target.value) })}
      className="h-7 text-xs"
      min={min}
      max={100}
    />
  )
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        Position &amp; Size (%)
      </span>
      <div className="grid grid-cols-2 gap-2">
        <PropertyRow label="X">{num("x", 0)}</PropertyRow>
        <PropertyRow label="Y">{num("y", 0)}</PropertyRow>
        <PropertyRow label="W">{num("width", 1)}</PropertyRow>
        <PropertyRow label="H">{num("height", 1)}</PropertyRow>
      </div>
      <AlignmentGrid rect={rect} onChange={onChange} />
    </div>
  )
}
