import * as React from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { STANDARD_COLORS } from "@/components/ui/color-palette-data"
import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isHex,
  normalizeHex,
  rgbToHex,
  type Hsv,
} from "@/lib/color/color"

const RECENT_COLORS_KEY = "lumenlive-recent-colors"
const MAX_RECENT_COLORS = 8
let recentColors: string[] = []
const recentListeners = new Set<() => void>()

function readRecentColors() {
  if (typeof window === "undefined") return
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(RECENT_COLORS_KEY) ?? "[]"
    )
    if (Array.isArray(stored)) {
      recentColors = stored.filter((color): color is string => isHex(color))
    }
  } catch {
    recentColors = []
  }
}

function rememberColor(color: string) {
  const normalized = normalizeHex(color)
  if (!normalized) return
  recentColors = [normalized, ...recentColors.filter((item) => item !== normalized)].slice(
    0,
    MAX_RECENT_COLORS
  )
  if (typeof window !== "undefined") {
    window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentColors))
  }
  recentListeners.forEach((listener) => listener())
}

function useRecentColors() {
  const [, refresh] = React.useState(0)

  React.useEffect(() => {
    readRecentColors()
    const listener = () => refresh((value) => value + 1)
    recentListeners.add(listener)
    return () => {
      recentListeners.delete(listener)
    }
  }, [])

  return recentColors
}

export function ColorMenu({
  value,
  onSelect,
  onClear,
}: {
  value: string
  onSelect: (color: string) => void
  onClear?: () => void
}) {
  const { t } = useTranslation("ui")
  const [showCustom, setShowCustom] = React.useState(false)
  const recent = useRecentColors()
  const normalizedValue = normalizeHex(value) ?? "#000000"

  const selectColor = (color: string) => {
    const normalized = normalizeHex(color)
    if (!normalized) return
    rememberColor(normalized)
    onSelect(normalized)
  }

  if (showCustom) {
    return (
      <div className="flex w-72 flex-col gap-3 p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-1 h-7 w-fit gap-1.5 px-1.5 text-xs"
          onClick={() => setShowCustom(false)}
        >
          <ArrowLeftIcon className="size-3.5" />
          {t("colorPalette.palette")}
        </Button>
        <ColorPickerBody value={normalizedValue} onChange={selectColor} />
      </div>
    )
  }

  return (
    <div className="flex w-72 flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {t("colorPalette.standardColors")}
        </span>
        <span className="font-mono text-[0.625rem] uppercase text-muted-foreground/70">
          {normalizedValue}
        </span>
      </div>

      <div
        className="grid grid-cols-8 gap-1.5"
        role="listbox"
        aria-label={t("colorPalette.standardColors")}
      >
        {STANDARD_COLORS.flat().map((color) => (
          <ColorOption
            key={color}
            color={color}
            activeColor={normalizedValue}
            onSelect={selectColor}
          />
        ))}
      </div>

      <div className="h-px bg-border/70" aria-hidden="true" />

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.6875rem] font-medium text-muted-foreground">
          {t("colorPalette.recentColors")}
        </span>
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: MAX_RECENT_COLORS }, (_, index) => {
            const color = recent[index]
            return color ? (
              <ColorOption
                key={`${color}-${index}`}
                color={color}
                activeColor={normalizedValue}
                onSelect={selectColor}
              />
            ) : (
              <span
                key={`empty-${index}`}
                className="size-6 rounded-sm border border-border/60 bg-muted/40"
                aria-hidden="true"
              />
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/70 pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-xs"
          onClick={() => setShowCustom(true)}
        >
          {t("colorPalette.moreColors")}
        </Button>
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs"
            onClick={onClear}
          >
            {t("colorPalette.clear")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ColorOption({
  color,
  activeColor,
  onSelect,
}: {
  color: string
  activeColor: string
  onSelect: (color: string) => void
}) {
  const { t } = useTranslation("ui")
  const isActive = activeColor === color

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      aria-label={color}
      title={color}
      className={cn(
        "size-6 rounded-sm border transition-[transform,box-shadow] hover:z-10 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover",
        isActive
          ? "border-foreground ring-2 ring-ring/70 ring-offset-1 ring-offset-popover"
          : "border-black/15 dark:border-white/20"
      )}
      style={{ backgroundColor: color }}
      onClick={() => onSelect(color)}
    >
      <span className="sr-only">{t("colorPalette.selectColor", { color })}</span>
    </button>
  )
}

export function ColorPickerBody({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation("ui")
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

      <label className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[0.6875rem] text-muted-foreground">
          {t("color.hex")}
        </span>
        <input
          value={hexText}
          onChange={(e) => onHexChange(e.target.value)}
          spellCheck={false}
          aria-invalid={!isHex(hexText)}
          className="h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-xs uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        {(["r", "g", "b"] as const).map((channel) => (
          <label key={channel} className="flex flex-col gap-1">
            <span className="text-[0.625rem] uppercase text-muted-foreground">
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
