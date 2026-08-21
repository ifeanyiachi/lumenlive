import * as React from "react"

import { cn } from "@/lib/utils"
import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isHex,
  normalizeHex,
  rgbToHex,
  type Hsv,
} from "@/lib/color/color"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/**
 * Drop-in replacement for the native `<input type="color">` swatch.
 *
 * Renders a color swatch button that opens a self-contained popover picker
 * (saturation area + hue slider) that leads with the Hex field — the native
 * WebView picker cannot be told to show Hex before RGB, so we own the popup.
 * RGB inputs remain available below the Hex field as a secondary view.
 *
 * `onChange` receives the canonical `#rrggbb` string directly (not an event),
 * so callers pass `(v) => set(v)` in place of `(e) => set(e.target.value)`.
 */
export function ColorSwatch({
  value,
  onChange,
  className,
  disabled,
  title,
  align = "start",
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  title?: string
  align?: "start" | "center" | "end"
}) {
  const swatchColor = normalizeHex(value) ?? "#000000"

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        title={title}
        aria-label={title ?? "Choose color"}
        style={{ backgroundColor: swatchColor }}
        className={cn(
          "cursor-pointer rounded border border-border disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <PopoverContent
        align={align}
        className="w-56 gap-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ColorPickerBody value={swatchColor} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

function ColorPickerBody({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  // HSV is the internal source of truth while interacting so dragging through
  // pure black/white or fully-desaturated colors doesn't lose hue/saturation.
  // Seeded from `value` on mount — the popover content is remounted each time
  // it opens, so this always reflects the latest external value on open.
  const [hsv, setHsv] = React.useState<Hsv>(() => hexToHsv(value))
  const [hexText, setHexText] = React.useState(value)

  const commit = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    setHexText(hex)
    onChange(hex)
  }

  const rgb = hexToRgb(hsvToHex(hsv))

  const onHexChange = (text: string) => {
    setHexText(text)
    const normal = normalizeHex(text)
    if (normal) {
      setHsv(hexToHsv(normal))
      onChange(normal)
    }
  }

  const onRgbChange = (channel: "r" | "g" | "b", raw: string) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(raw) || 0)))
    const nextHex = rgbToHex({ ...rgb, [channel]: n })
    setHsv(hexToHsv(nextHex))
    setHexText(nextHex)
    onChange(nextHex)
  }

  return (
    <div className="flex flex-col gap-3">
      <SaturationArea hsv={hsv} onChange={commit} />
      <HueSlider hue={hsv.h} onChange={(h) => commit({ ...hsv, h })} />

      {/* Hex first — the leading, default field */}
      <label className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[0.6875rem] text-muted-foreground">
          Hex
        </span>
        <input
          value={hexText}
          onChange={(e) => onHexChange(e.target.value)}
          spellCheck={false}
          aria-invalid={!isHex(hexText)}
          className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-xs uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
      </label>

      {/* RGB secondary view */}
      <div className="grid grid-cols-3 gap-2">
        {(["r", "g", "b"] as const).map((channel) => (
          <label key={channel} className="flex flex-col gap-1">
            <span className="text-[0.625rem] text-muted-foreground uppercase">
              {channel}
            </span>
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[channel]}
              onChange={(e) => onRgbChange(channel, e.target.value)}
              className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function SaturationArea({
  hsv,
  onChange,
}: {
  hsv: Hsv
  onChange: (hsv: Hsv) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  const handle = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    onChange({ ...hsv, s: x * 100, v: (1 - y) * 100 })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handle(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      handle(e.clientX, e.clientY)
    }
  }

  const hueHex = hsvToHex({ h: hsv.h, s: 100, v: 100 })

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="relative h-32 w-full cursor-crosshair touch-none rounded-md"
      style={{
        backgroundColor: hueHex,
        backgroundImage:
          "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
      }}
    >
      <span
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: `${hsv.s}%`,
          top: `${100 - hsv.v}%`,
          backgroundColor: hsvToHex(hsv),
        }}
      />
    </div>
  )
}

function HueSlider({
  hue,
  onChange,
}: {
  hue: number
  onChange: (hue: number) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  const handle = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onChange(x * 360)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handle(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e.clientX)
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="relative h-3 w-full cursor-ew-resize touch-none rounded-full"
      style={{
        backgroundImage:
          "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
      }}
    >
      <span
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: `${(hue / 360) * 100}%`,
          backgroundColor: hsvToHex({ h: hue, s: 100, v: 100 }),
        }}
      />
    </div>
  )
}
