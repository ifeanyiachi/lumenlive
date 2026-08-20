import { TimerIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SlideElement } from "@/types/slide"
import type { CountdownFormat } from "@/types/alert"
import { findTimerElement } from "@/lib/theme/model/roles"
import {
  ThemePanelShell,
  Section,
  PropertyRow,
  ColorRow,
  SizeRow,
  MissingPlaceholder,
  SelectElementHint,
} from "./_shared"
import { patchElement } from "./helpers"

/** Parse an optional seconds field: blank → undefined, otherwise a clamped int. */
function parseThreshold(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === "") return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

/**
 * Countdown theme controls (themeredo.md, Phase 3). Leads with the timer
 * placeholder's display format and urgency thresholds — the behaviour that
 * matters most for a countdown — then its type size and color.
 */
export function CountdownThemeProperties({
  elements,
}: {
  elements: SlideElement[]
}) {
  const timer = findTimerElement(elements)

  return (
    <ThemePanelShell
      title="Countdown Theme"
      icon={<TimerIcon className="size-3.5" />}
    >
      {timer ? (
        <>
          <Section label="Timer">
            <PropertyRow label="Format">
              <Select
                value={timer.format}
                onValueChange={(v) =>
                  patchElement(timer.id, { format: v as CountdownFormat })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm:ss">MM:SS</SelectItem>
                  <SelectItem value="hh:mm:ss">HH:MM:SS</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
          </Section>
          <Section label="Urgency (seconds left)">
            <PropertyRow label="Warn">
              <Input
                type="number"
                value={timer.warnSeconds ?? ""}
                onChange={(e) =>
                  patchElement(timer.id, {
                    warnSeconds: parseThreshold(e.target.value),
                  })
                }
                className="h-7 text-xs"
                min={0}
                placeholder="off"
              />
            </PropertyRow>
            <PropertyRow label="Danger">
              <Input
                type="number"
                value={timer.dangerSeconds ?? ""}
                onChange={(e) =>
                  patchElement(timer.id, {
                    dangerSeconds: parseThreshold(e.target.value),
                  })
                }
                className="h-7 text-xs"
                min={0}
                placeholder="off"
              />
            </PropertyRow>
          </Section>
          <Section label="Text">
            <SizeRow
              label="Size"
              value={timer.fontSize}
              onChange={(v) => patchElement(timer.id, { fontSize: v })}
              max={320}
            />
            <ColorRow
              label="Color"
              value={timer.color}
              onChange={(v) => patchElement(timer.id, { color: v })}
            />
          </Section>
        </>
      ) : (
        <MissingPlaceholder what="a timer placeholder" />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
