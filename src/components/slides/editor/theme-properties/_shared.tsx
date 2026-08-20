import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * Shared building blocks for the type-specific theme-properties panels
 * (themeredo.md, Phase 3). Each panel leads with the controls that matter for its
 * type, editing its placeholder element(s) directly; the row helpers here keep
 * those panels thin and visually consistent with the element property panels.
 * The element-patch helper lives in `./helpers` (this file exports components
 * only, for fast-refresh).
 */

export function ThemePanelShell({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={title} icon={icon} />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-4 p-3">{children}</div>
      </div>
    </div>
  )
}

export function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

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

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <PropertyRow label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded border border-border"
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

export function SizeRow({
  label,
  value,
  onChange,
  min = 12,
  max = 240,
  step = 2,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <PropertyRow label={label}>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
      />
    </PropertyRow>
  )
}

export function WeightRow({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <PropertyRow label="Weight">
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="400">Regular</SelectItem>
          <SelectItem value="600">Semibold</SelectItem>
          <SelectItem value="700">Bold</SelectItem>
          <SelectItem value="900">Black</SelectItem>
        </SelectContent>
      </Select>
    </PropertyRow>
  )
}

export function AlignRow({
  value,
  onChange,
}: {
  value: "left" | "center" | "right"
  onChange: (value: "left" | "center" | "right") => void
}) {
  return (
    <PropertyRow label="Align">
      <Select
        value={value}
        onValueChange={(v) => onChange(v as "left" | "center" | "right")}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="left">Left</SelectItem>
          <SelectItem value="center">Center</SelectItem>
          <SelectItem value="right">Right</SelectItem>
        </SelectContent>
      </Select>
    </PropertyRow>
  )
}

/**
 * Shown when a type's required placeholder is missing from the draft (e.g. the
 * user deleted it). Steers them to re-add it rather than silently rendering an
 * empty section.
 */
export function MissingPlaceholder({ what }: { what: string }) {
  return (
    <Section label="Missing">
      <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[0.6875rem] text-amber-600 dark:text-amber-400">
        This theme needs {what}. Add it from the “+” menu so content has
        somewhere to flow.
      </p>
    </Section>
  )
}

/** Footer hint: element-level editing still lives in the layer/element panel. */
export function SelectElementHint({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-[0.6875rem] leading-relaxed text-muted-foreground",
        className
      )}
    >
      Select any element on the canvas to edit its full properties, or use the
      “+” menu to add decoration around the placeholder.
    </p>
  )
}
