import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { AnchorPicker } from "@/components/shared/anchor-picker"
import type { AnchorPosition } from "@/components/shared/anchor-picker"

export function LayoutProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const layout = draftTheme.layout
  const resolution = draftTheme.resolution
  const referenceGap =
    layout.referenceGap ??
    Math.max(16, Math.round(draftTheme.reference.fontSize * 0.5))

  const bgWidthPx = Math.round(
    (layout.backgroundWidth / 100) * resolution.width
  )
  const bgHeightPx = Math.round(
    (layout.backgroundHeight / 100) * resolution.height
  )
  const textWidthPx = Math.round(
    (layout.textAreaWidth / 100) * resolution.width
  )
  const textHeightPx = Math.round(
    (layout.textAreaHeight / 100) * resolution.height
  )

  const verseNumbers = draftTheme.verseNumbers
  const superscriptSizePct = Math.round(
    (verseNumbers.fontSize / draftTheme.verseText.fontSize) * 100
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Anchor Position */}
      <div className="flex flex-col gap-0.5 pb-1">
        <h4 className="text-xs font-semibold">Anchor Position</h4>
        <p className="text-[11px] text-muted-foreground">
          Where the content block anchors on screen
        </p>
      </div>

      <div className="flex items-center gap-4">
        <AnchorPicker
          value={layout.anchor as AnchorPosition}
          onChange={(anchor) => update("layout.anchor", anchor)}
        />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Offset X
            </label>
            <Input
              type="number"
              value={layout.offsetX}
              onChange={(e) => update("layout.offsetX", Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Offset Y
            </label>
            <Input
              type="number"
              value={layout.offsetY}
              onChange={(e) => update("layout.offsetY", Number(e.target.value))}
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Background Dimensions */}
      <div className="flex flex-col gap-0.5 border-t pt-3 pb-1">
        <h4 className="text-xs font-semibold">Background Dimensions</h4>
      </div>

      {/* Width */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Width
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {layout.backgroundWidth}% ({bgWidthPx}px)
          </span>
        </div>
        <Slider
          min={10}
          max={100}
          step={1}
          value={[layout.backgroundWidth]}
          onValueChange={([v]) => update("layout.backgroundWidth", v)}
        />
      </div>

      {/* Height */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Height
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {layout.backgroundHeight}% ({bgHeightPx}px)
          </span>
        </div>
        <Slider
          min={10}
          max={100}
          step={1}
          value={[layout.backgroundHeight]}
          onValueChange={([v]) => update("layout.backgroundHeight", v)}
        />
      </div>

      {/* Text Area Dimensions */}
      <div className="flex flex-col gap-0.5 border-t pt-3 pb-1">
        <h4 className="text-xs font-semibold">Text Area Dimensions</h4>
      </div>

      {/* Text Width */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Text Width
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {layout.textAreaWidth}% ({textWidthPx}px)
          </span>
        </div>
        <Slider
          min={10}
          max={100}
          step={1}
          value={[layout.textAreaWidth]}
          onValueChange={([v]) => update("layout.textAreaWidth", v)}
        />
      </div>

      {/* Text Height */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Text Height
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {layout.textAreaHeight}% ({textHeightPx}px)
          </span>
        </div>
        <Slider
          min={10}
          max={100}
          step={1}
          value={[layout.textAreaHeight]}
          onValueChange={([v]) => update("layout.textAreaHeight", v)}
        />
      </div>

      {/* Padding */}
      <div className="flex flex-col gap-0.5 border-t pt-3 pb-1">
        <h4 className="text-xs font-semibold">Padding</h4>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Top
          </label>
          <Input
            type="number"
            min={0}
            value={layout.padding.top}
            onChange={(e) =>
              update("layout.padding.top", Number(e.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Right
          </label>
          <Input
            type="number"
            min={0}
            value={layout.padding.right}
            onChange={(e) =>
              update("layout.padding.right", Number(e.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Bottom
          </label>
          <Input
            type="number"
            min={0}
            value={layout.padding.bottom}
            onChange={(e) =>
              update("layout.padding.bottom", Number(e.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Left
          </label>
          <Input
            type="number"
            min={0}
            value={layout.padding.left}
            onChange={(e) =>
              update("layout.padding.left", Number(e.target.value))
            }
          />
        </div>
      </div>

      {/* Element Spacing */}
      <div className="flex flex-col gap-0.5 border-t pt-3 pb-1">
        <h4 className="text-xs font-semibold">Element Spacing</h4>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Verse / Reference
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {referenceGap}px
          </span>
        </div>
        <Slider
          min={0}
          max={200}
          step={1}
          value={[referenceGap]}
          onValueChange={([v]) => update("layout.referenceGap", v)}
        />
      </div>

      {/* Verse Numbers */}
      <div className="flex flex-col gap-0.5 border-t pt-3 pb-1">
        <h4 className="text-xs font-semibold">Verse Numbers</h4>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Show Verse Numbers
        </label>
        <input
          type="checkbox"
          checked={verseNumbers.visible}
          onChange={(e) => update("verseNumbers.visible", e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {verseNumbers.visible && (
        <>
          {/* Verse Number Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Number Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={verseNumbers.color}
                onChange={(e) => update("verseNumbers.color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={verseNumbers.color}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    update("verseNumbers.color", v)
                  }
                }}
                className="w-20 font-mono text-xs"
              />
            </div>
          </div>

          {/* Superscript */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Superscript
            </label>
            <input
              type="checkbox"
              checked={verseNumbers.superscript}
              onChange={(e) =>
                update("verseNumbers.superscript", e.target.checked)
              }
              className="h-4 w-4 rounded border-input accent-primary"
            />
          </div>

          {/* Superscript Size */}
          {verseNumbers.superscript && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Superscript Size
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {superscriptSizePct}%
                </span>
              </div>
              <Slider
                min={20}
                max={100}
                step={1}
                value={[superscriptSizePct]}
                onValueChange={([v]) => {
                  const newFontSize = Math.round(
                    (v / 100) * draftTheme.verseText.fontSize
                  )
                  update("verseNumbers.fontSize", newFontSize)
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
