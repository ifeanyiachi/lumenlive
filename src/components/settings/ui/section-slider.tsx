import type { ReactNode } from "react"

import { Slider } from "@/components/ui/slider"

/**
 * Labelled slider row shared by Audio, Speech, and Display Mode sections:
 * an uppercase label with a live value readout, the slider, an optional
 * extra row (e.g. Snappy/Patient legend), then a description paragraph.
 *
 * Markup is preserved verbatim from the inlined copies so output is identical.
 */
export function SectionSlider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onValueChange,
  description,
  children,
}: {
  label: ReactNode
  valueLabel: ReactNode
  min: number
  max: number
  step: number
  value: number
  onValueChange: (value: number) => void
  description: ReactNode
  /** Optional content rendered between the slider and the description. */
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {label}
        </label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {valueLabel}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
      />
      {children}
      <p className="text-[0.625rem] text-muted-foreground">{description}</p>
    </div>
  )
}
