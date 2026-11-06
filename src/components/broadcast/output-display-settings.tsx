import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useBroadcastStore } from "@/stores"
import type { BroadcastOutput, OutputDisplayMode } from "@/types"
import { useTranslation } from "react-i18next"

const MAX_VERSE_SCALE_OPTIONS = [
  { value: "1.25", label: "1.25×" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2×" },
  { value: "3", label: "3×" },
]

/**
 * Per-output surface sizing + verse auto-fit, for any output (id-generic via the
 * store actions). Two rows:
 *  - Output size: Match monitor vs a Custom resolution (Custom reveals width /
 *    height / fit on the same row).
 *  - Verse text: auto-fit toggle, max scale, and the readable px floor — all on one
 *    row. (Pagination was removed per the Broadcast settings redesign.)
 * Writes go through the store, which pushes each change to the live output window.
 */
export function OutputDisplaySettings({ output }: { output: BroadcastOutput }) {
  const { t } = useTranslation("broadcast-output")
  const store = useBroadcastStore.getState
  const displayMode = output.displayMode ?? "native"
  const custom = output.customResolution ?? { width: 1920, height: 1080 }
  const customFit = output.customFit ?? "contain"
  const autoFit = output.verseAutoFit ?? true
  const maxScale = output.maxVerseScale ?? 1.5
  const minSize = output.minVerseFontSize ?? 40

  return (
    <div className="divide-y divide-border/70 border-t border-border/70">
      {/* Output size */}
      <div className="space-y-2.5 py-5">
        <div className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("outputSize")}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-full max-w-[220px] space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("displaySize")}
            </label>
            <Select
              value={displayMode}
              onValueChange={(v) =>
                store().setOutputDisplayMode(output.id, v as OutputDisplayMode)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">{t("matchMonitor")}</SelectItem>
                <SelectItem value="custom">{t("customSize")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {displayMode === "custom" && (
            <div className="grid min-w-[280px] flex-1 grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("width")}
                </label>
                <Input
                  type="number"
                  value={custom.width}
                  onChange={(e) =>
                    store().setOutputCustomResolution(output.id, {
                      width: Math.max(1, Number(e.target.value)),
                      height: custom.height,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("height")}
                </label>
                <Input
                  type="number"
                  value={custom.height}
                  onChange={(e) =>
                    store().setOutputCustomResolution(output.id, {
                      width: custom.width,
                      height: Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {t("fitLabel")}
                </label>
                <Select
                  value={customFit}
                  onValueChange={(v) =>
                    store().setOutputCustomFit(output.id, v as "contain" | "cover")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contain">{t("fit")}</SelectItem>
                    <SelectItem value="cover">{t("fill")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verse text */}
      <div className="space-y-2.5 py-5">
        <div className="text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("verseText")}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex h-10 items-center justify-between gap-2 self-end rounded-md border border-border/60 px-3">
            <label className="text-xs text-muted-foreground">
              {t("autoFitVerseText")}
            </label>
            <Switch
              checked={autoFit}
              onCheckedChange={(v) => store().setVerseAutoFit(output.id, v)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("maxVerseScale")}
            </label>
            <Select
              value={String(maxScale)}
              onValueChange={(v) => store().setMaxVerseScale(output.id, Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAX_VERSE_SCALE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("minimumVerseSize")}
            </label>
            <Input
              type="number"
              min={8}
              value={minSize}
              onChange={(e) =>
                store().setMinVerseFontSize(
                  output.id,
                  Math.max(8, Number(e.target.value))
                )
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
