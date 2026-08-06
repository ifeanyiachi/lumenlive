import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TextShadowControls,
  TextOutlineControls,
} from "@/components/shared/text-decoration-controls"

const VERTICAL_ALIGN_OPTIONS = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
] as const

function parseColorOpacity(color: string): { hex: string; opacity: number } {
  if (color.length === 9 && color.startsWith("#")) {
    const alphaHex = color.slice(7, 9)
    const alpha = parseInt(alphaHex, 16) / 255
    return { hex: color.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  if (color.length === 7 && color.startsWith("#")) {
    return { hex: color, opacity: 100 }
  }
  return { hex: color || "#ffffff", opacity: 100 }
}

function buildColorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) return hex
  const alphaHex = Math.round((opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

function SectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-0.5 pb-1">
      <h4 className="text-xs font-semibold">{title}</h4>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </div>
  )
}

function SpacingControls({ prefix }: { prefix: "verseText" | "reference" }) {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const data =
    prefix === "verseText" ? draftTheme.verseText : draftTheme.reference
  const { hex: colorHex, opacity: colorOpacity } = parseColorOpacity(data.color)
  const verticalAlign = data.verticalAlign ?? "top"

  return (
    <div className="flex flex-col gap-3">
      {/* Line Height */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Line Height
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {(prefix === "verseText"
              ? draftTheme.verseText.lineHeight
              : (draftTheme.reference.lineHeight ?? 1.4)
            ).toFixed(2)}
          </span>
        </div>
        <Slider
          min={0.5}
          max={3.0}
          step={0.05}
          value={[
            prefix === "verseText"
              ? draftTheme.verseText.lineHeight
              : (draftTheme.reference.lineHeight ?? 1.4),
          ]}
          onValueChange={([v]) => update(`${prefix}.lineHeight`, v)}
        />
      </div>

      {/* Letter Spacing */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Letter Spacing
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {data.letterSpacing}px
          </span>
        </div>
        <Slider
          min={-5}
          max={50}
          step={0.5}
          value={[data.letterSpacing]}
          onValueChange={([v]) => update(`${prefix}.letterSpacing`, v)}
        />
      </div>

      {/* Vertical Alignment */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Vertical Alignment
        </label>
        <Select
          value={verticalAlign}
          onValueChange={(v) => update(`${prefix}.verticalAlign`, v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VERTICAL_ALIGN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color Opacity */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Color Opacity
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {colorOpacity}%
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[colorOpacity]}
          onValueChange={([v]) =>
            update(`${prefix}.color`, buildColorWithOpacity(colorHex, v))
          }
        />
      </div>
    </div>
  )
}

function ReferenceProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const isCountdown = draftTheme.category === "countdown"

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title={isCountdown ? "Label Text" : "Reference Text"}
        description={
          isCountdown
            ? "Customize the countdown's label text"
            : "Customize how reference text appears"
        }
      />
      <SpacingControls prefix="reference" />

      {/* Uppercase */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Uppercase
        </label>
        <input
          type="checkbox"
          checked={draftTheme.reference.uppercase}
          onChange={(e) => update("reference.uppercase", e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {/* Reference Position */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Reference Position
        </label>
        <Select
          value={draftTheme.reference.position}
          onValueChange={(v) => update("reference.position", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="above">Above Verse</SelectItem>
            <SelectItem value="below">Below Verse</SelectItem>
            <SelectItem value="inline">Inline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TextShadowControls
        shadow={draftTheme.reference.shadow ?? null}
        onToggle={(enabled) => {
          update(
            "reference.shadow",
            enabled ? { color: "#00000080", blur: 4, x: 2, y: 2 } : null
          )
        }}
        onUpdate={(path, value) => update(`reference.shadow.${path}`, value)}
      />

      <TextOutlineControls
        outline={draftTheme.reference.outline ?? null}
        onToggle={(enabled) => {
          update(
            "reference.outline",
            enabled ? { color: "#000000", width: 1 } : null
          )
        }}
        onUpdate={(path, value) => update(`reference.outline.${path}`, value)}
      />
    </div>
  )
}

function VerseProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const isCountdown = draftTheme.category === "countdown"

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        title={isCountdown ? "Timer Text" : "Verse Text"}
        description={
          isCountdown
            ? "Customize how the timer digits appear"
            : "Customize how verse text appears"
        }
      />
      <SpacingControls prefix="verseText" />

      <TextShadowControls
        shadow={draftTheme.verseText.shadow}
        onToggle={(enabled) => {
          update(
            "verseText.shadow",
            enabled ? { color: "#00000080", blur: 4, x: 2, y: 2 } : null
          )
        }}
        onUpdate={(path, value) => update(`verseText.shadow.${path}`, value)}
      />

      <TextOutlineControls
        outline={draftTheme.verseText.outline}
        onToggle={(enabled) => {
          update(
            "verseText.outline",
            enabled ? { color: "#000000", width: 1 } : null
          )
        }}
        onUpdate={(path, value) => update(`verseText.outline.${path}`, value)}
      />
    </div>
  )
}

export function TextProperties() {
  const selectedElement = useBroadcastStore((s) => s.selectedElement)

  if (selectedElement === "reference") {
    return <ReferenceProperties />
  }

  if (selectedElement === "verse") {
    return <VerseProperties />
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        No element selected
      </p>
      <p className="text-xs text-muted-foreground">
        Click on verse, reference, or translation text in the canvas to edit its
        properties
      </p>
    </div>
  )
}
