import { useBroadcastStore } from "@/stores"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StageLayout, StageZone } from "@/types/stage-layout"

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (n: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onCommit(n)
        }}
        className="h-8"
      />
    </Field>
  )
}

/** Path helper: index of a zone in the draft by id. */
function zoneIndex(draft: StageLayout, id: string | null): number {
  return id ? draft.zones.findIndex((z) => z.id === id) : -1
}

function ZoneProperties({
  draft,
  zone,
}: {
  draft: StageLayout
  zone: StageZone
}) {
  const idx = zoneIndex(draft, zone.id)
  if (idx < 0) return null
  const set = (path: string, value: unknown) =>
    useBroadcastStore
      .getState()
      .updateStageDraftNested(`zones.${idx}.${path}`, value)

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">
        <Input
          value={zone.name}
          onChange={(e) => set("name", e.target.value)}
          className="h-8"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
          Position &amp; Size
        </p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={zone.x} onCommit={(n) => set("x", n)} />
          <NumberField label="Y" value={zone.y} onCommit={(n) => set("y", n)} />
          <NumberField
            label="Width"
            value={zone.width}
            onCommit={(n) => set("width", Math.max(20, n))}
          />
          <NumberField
            label="Height"
            value={zone.height}
            onCommit={(n) => set("height", Math.max(20, n))}
          />
        </div>
      </div>

      {zone.source === "clock" && (
        <Field label="Clock Format">
          <Select
            value={zone.clockFormat ?? "12h"}
            onValueChange={(v) => set("clockFormat", v)}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour</SelectItem>
              <SelectItem value="24h">24-hour</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}

      {zone.source !== "clock" && (
        <>
          <Field label="Header Label">
            <Input
              value={zone.label ?? ""}
              onChange={(e) => set("label", e.target.value)}
              className="h-8"
            />
          </Field>
          <label className="flex items-center justify-between">
            <span className="text-[0.625rem] font-medium tracking-wide text-muted-foreground uppercase">
              Show Header
            </span>
            <Switch
              checked={zone.showHeader ?? false}
              onCheckedChange={(c) => set("showHeader", c)}
            />
          </label>
        </>
      )}

      {zone.text && (
        <div>
          <p className="mb-1.5 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
            Text
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Font Size"
              value={zone.text.fontSize}
              onCommit={(n) => set("text.fontSize", Math.max(8, n))}
            />
            <Field label="Colour">
              <Input
                type="color"
                value={zone.text.color}
                onChange={(e) => set("text.color", e.target.value)}
                className="h-8 p-1"
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}

function LayoutProperties({ draft }: { draft: StageLayout }) {
  const store = useBroadcastStore.getState
  return (
    <div className="flex flex-col gap-4">
      <Field label="Display Mode">
        <Select
          value={draft.displayMode}
          onValueChange={(v) =>
            store().updateStageDraft({ displayMode: v as "zone" | "custom" })
          }
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zone">Zone Layout</SelectItem>
            <SelectItem value="custom">Custom Template</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Background Colour">
        <Input
          type="color"
          value={draft.background.color}
          onChange={(e) =>
            store().updateStageDraftNested("background.color", e.target.value)
          }
          className="h-8 p-1"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Select a zone on the canvas to edit its properties.
      </p>
    </div>
  )
}

export function StageInspector() {
  const draft = useBroadcastStore((s) => s.draftStageLayout)
  const selectedZone = useBroadcastStore((s) => s.selectedZone)
  if (!draft) return null
  const zone = draft.zones.find((z) => z.id === selectedZone) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">
          {zone ? zone.name : "Layout"}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {zone ? (
            <ZoneProperties draft={draft} zone={zone} />
          ) : (
            <LayoutProperties draft={draft} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
