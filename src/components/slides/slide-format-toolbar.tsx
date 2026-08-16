import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignVerticalJustifyStartIcon,
  AlignVerticalJustifyCenterIcon,
  AlignVerticalJustifyEndIcon,
  ListIcon,
  ListOrderedIcon,
  RotateCwIcon,
} from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { FontFamilyPicker } from "@/components/shared/font-family-picker"
import {
  ToolbarDivider,
  ToolbarToggle,
  ToolbarAlignButton,
} from "@/components/shared/toolbar-primitives"
import type {
  SlideElement,
  SlideTextElement,
  SlideScriptureElement,
  SlideImageElement,
  SlideShapeElement,
  SlideVideoElement,
} from "@/types/slide"
import { Slider } from "@/components/ui/slider"

function parseColorOpacity(color: string): { hex: string; opacity: number } {
  if (color.length === 9 && color.startsWith("#")) {
    const alpha = parseInt(color.slice(7, 9), 16) / 255
    return { hex: color.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  return { hex: color || "#ffffff", opacity: 100 }
}

function buildColorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) return hex.slice(0, 7)
  const alpha = Math.round((opacity / 100) * 255)
  return hex.slice(0, 7) + alpha.toString(16).padStart(2, "0")
}

function TextToolbar({ element }: { element: SlideTextElement }) {
  const update = (updates: Partial<SlideTextElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const { hex: colorHex, opacity: colorOpacity } = parseColorOpacity(
    element.color
  )

  return (
    <>
      {/* Font family */}
      <div className="w-36">
        <FontFamilyPicker
          value={element.fontFamily}
          onChange={(v) => update({ fontFamily: v })}
        />
      </div>

      {/* Font size */}
      <Input
        type="number"
        value={element.fontSize}
        onChange={(e) => update({ fontSize: Number(e.target.value) })}
        className="h-7 w-16 [appearance:textfield] text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        min={8}
        max={200}
      />

      {/* Font weight */}
      <Select
        value={String(element.fontWeight)}
        onValueChange={(v) => update({ fontWeight: Number(v) })}
      >
        <SelectTrigger className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="100">Thin</SelectItem>
          <SelectItem value="200">Extra Light</SelectItem>
          <SelectItem value="300">Light</SelectItem>
          <SelectItem value="400">Regular</SelectItem>
          <SelectItem value="500">Medium</SelectItem>
          <SelectItem value="600">Semibold</SelectItem>
          <SelectItem value="700">Bold</SelectItem>
          <SelectItem value="800">Extra Bold</SelectItem>
          <SelectItem value="900">Black</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Color + opacity */}
      <input
        type="color"
        value={colorHex}
        onChange={(e) =>
          update({ color: buildColorWithOpacity(e.target.value, colorOpacity) })
        }
        className="size-7 cursor-pointer rounded border border-border"
        title="Text color"
      />
      <div className="w-16" title="Color opacity">
        <Slider
          value={[colorOpacity]}
          onValueChange={([v]) =>
            update({ color: buildColorWithOpacity(colorHex, v) })
          }
          min={0}
          max={100}
          step={1}
        />
      </div>

      <ToolbarDivider />

      {/* Bold, Italic, Underline */}
      <ToolbarToggle
        active={element.bold}
        onClick={() =>
          update({ bold: !element.bold, fontWeight: !element.bold ? 700 : 400 })
        }
        icon={BoldIcon}
        title="Bold"
      />
      <ToolbarToggle
        active={element.italic}
        onClick={() => update({ italic: !element.italic })}
        icon={ItalicIcon}
        title="Italic"
      />
      <ToolbarToggle
        active={element.underline}
        onClick={() => update({ underline: !element.underline })}
        icon={UnderlineIcon}
        title="Underline"
      />

      <ToolbarDivider />

      {/* Text transform */}
      <Select
        value={element.textTransform}
        onValueChange={(v) =>
          update({ textTransform: v as SlideTextElement["textTransform"] })
        }
      >
        <SelectTrigger className="h-7 w-20 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Aa</SelectItem>
          <SelectItem value="uppercase">AA</SelectItem>
          <SelectItem value="lowercase">aa</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Horizontal alignment */}
      <ToolbarAlignButton
        active={element.horizontalAlign === "left"}
        onClick={() => update({ horizontalAlign: "left" })}
        icon={AlignLeftIcon}
        title="Align left"
      />
      <ToolbarAlignButton
        active={element.horizontalAlign === "center"}
        onClick={() => update({ horizontalAlign: "center" })}
        icon={AlignCenterIcon}
        title="Align center"
      />
      <ToolbarAlignButton
        active={element.horizontalAlign === "right"}
        onClick={() => update({ horizontalAlign: "right" })}
        icon={AlignRightIcon}
        title="Align right"
      />

      <ToolbarDivider />

      {/* Vertical alignment */}
      <ToolbarAlignButton
        active={element.verticalAlign === "top"}
        onClick={() => update({ verticalAlign: "top" })}
        icon={AlignVerticalJustifyStartIcon}
        title="Align top"
      />
      <ToolbarAlignButton
        active={element.verticalAlign === "middle"}
        onClick={() => update({ verticalAlign: "middle" })}
        icon={AlignVerticalJustifyCenterIcon}
        title="Align middle"
      />
      <ToolbarAlignButton
        active={element.verticalAlign === "bottom"}
        onClick={() => update({ verticalAlign: "bottom" })}
        icon={AlignVerticalJustifyEndIcon}
        title="Align bottom"
      />

      <ToolbarDivider />

      {/* List type */}
      <ToolbarToggle
        active={element.listType === "bullet"}
        onClick={() =>
          update({
            listType: element.listType === "bullet" ? "none" : "bullet",
          })
        }
        icon={ListIcon}
        title="Bullet list"
      />
      <ToolbarToggle
        active={element.listType === "numbered"}
        onClick={() =>
          update({
            listType: element.listType === "numbered" ? "none" : "numbered",
          })
        }
        icon={ListOrderedIcon}
        title="Numbered list"
      />

      {element.rotation ? (
        <>
          <ToolbarDivider />
          <RotateCwIcon className="size-3 text-muted-foreground" />
          <Input
            type="number"
            value={element.rotation}
            onChange={(e) => update({ rotation: Number(e.target.value) % 360 })}
            className="h-7 w-14 text-xs"
            min={0}
            max={359}
            title="Rotation"
          />
        </>
      ) : null}
    </>
  )
}

function ScriptureToolbar({ element }: { element: SlideScriptureElement }) {
  const update = (updates: Partial<SlideScriptureElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <>
      {/* Font family */}
      <div className="w-36">
        <FontFamilyPicker
          value={element.fontFamily}
          onChange={(v) => update({ fontFamily: v })}
        />
      </div>

      {/* Verse font size */}
      <Input
        type="number"
        value={element.fontSize}
        onChange={(e) => update({ fontSize: Number(e.target.value) })}
        className="h-7 w-16 [appearance:textfield] text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        min={8}
        max={200}
        title="Verse font size"
      />

      {/* Font weight */}
      <Select
        value={String(element.fontWeight)}
        onValueChange={(v) => update({ fontWeight: Number(v) })}
      >
        <SelectTrigger className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="300">Light</SelectItem>
          <SelectItem value="400">Regular</SelectItem>
          <SelectItem value="500">Medium</SelectItem>
          <SelectItem value="600">Semibold</SelectItem>
          <SelectItem value="700">Bold</SelectItem>
          <SelectItem value="800">Extra Bold</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Verse color */}
      <input
        type="color"
        value={element.color}
        onChange={(e) => update({ color: e.target.value })}
        className="size-7 cursor-pointer rounded border border-border"
        title="Verse color"
      />

      {/* Reference color */}
      <input
        type="color"
        value={element.referenceColor}
        onChange={(e) => update({ referenceColor: e.target.value })}
        className="size-7 cursor-pointer rounded border border-border"
        title="Reference color"
      />

      <ToolbarDivider />

      {/* Bold, Italic */}
      <ToolbarToggle
        active={element.bold}
        onClick={() =>
          update({ bold: !element.bold, fontWeight: !element.bold ? 700 : 400 })
        }
        icon={BoldIcon}
        title="Bold"
      />
      <ToolbarToggle
        active={element.italic}
        onClick={() => update({ italic: !element.italic })}
        icon={ItalicIcon}
        title="Italic"
      />

      <ToolbarDivider />

      {/* Horizontal alignment */}
      <ToolbarAlignButton
        active={element.horizontalAlign === "left"}
        onClick={() => update({ horizontalAlign: "left" })}
        icon={AlignLeftIcon}
        title="Align left"
      />
      <ToolbarAlignButton
        active={element.horizontalAlign === "center"}
        onClick={() => update({ horizontalAlign: "center" })}
        icon={AlignCenterIcon}
        title="Align center"
      />
      <ToolbarAlignButton
        active={element.horizontalAlign === "right"}
        onClick={() => update({ horizontalAlign: "right" })}
        icon={AlignRightIcon}
        title="Align right"
      />

      <ToolbarDivider />

      {/* Vertical alignment */}
      <ToolbarAlignButton
        active={element.verticalAlign === "top"}
        onClick={() => update({ verticalAlign: "top" })}
        icon={AlignVerticalJustifyStartIcon}
        title="Align top"
      />
      <ToolbarAlignButton
        active={element.verticalAlign === "middle"}
        onClick={() => update({ verticalAlign: "middle" })}
        icon={AlignVerticalJustifyCenterIcon}
        title="Align middle"
      />
      <ToolbarAlignButton
        active={element.verticalAlign === "bottom"}
        onClick={() => update({ verticalAlign: "bottom" })}
        icon={AlignVerticalJustifyEndIcon}
        title="Align bottom"
      />
    </>
  )
}

function ImageToolbar({ element }: { element: SlideImageElement }) {
  const update = (updates: Partial<SlideImageElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <>
      {/* Object fit */}
      <Select
        value={element.objectFit}
        onValueChange={(v) =>
          update({ objectFit: v as SlideImageElement["objectFit"] })
        }
      >
        <SelectTrigger className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contain">Contain</SelectItem>
          <SelectItem value="cover">Cover</SelectItem>
          <SelectItem value="fill">Fill</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Opacity */}
      <span className="text-[0.6875rem] text-muted-foreground">Opacity</span>
      <div className="w-24">
        <Slider
          value={[element.opacity]}
          onValueChange={([v]) => update({ opacity: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      <ToolbarDivider />

      {/* Border radius */}
      <span className="text-[0.6875rem] text-muted-foreground">Radius</span>
      <div className="w-24">
        <Slider
          value={[element.borderRadius]}
          onValueChange={([v]) => update({ borderRadius: v })}
          min={0}
          max={100}
          step={1}
        />
      </div>
    </>
  )
}

function ShapeToolbar({ element }: { element: SlideShapeElement }) {
  const update = (updates: Partial<SlideShapeElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <>
      {/* Shape type */}
      <Select
        value={element.shapeType}
        onValueChange={(v) =>
          update({ shapeType: v as SlideShapeElement["shapeType"] })
        }
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rectangle">Rectangle</SelectItem>
          <SelectItem value="rounded-rect">Rounded Rect</SelectItem>
          <SelectItem value="circle">Circle</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Fill color */}
      <span className="text-[0.6875rem] text-muted-foreground">Fill</span>
      <input
        type="color"
        value={
          element.fillColor.startsWith("rgba") ? "#ffffff" : element.fillColor
        }
        onChange={(e) => update({ fillColor: e.target.value })}
        className="size-7 cursor-pointer rounded border border-border"
        title="Fill color"
      />

      <ToolbarDivider />

      {/* Stroke color */}
      <span className="text-[0.6875rem] text-muted-foreground">Stroke</span>
      <input
        type="color"
        value={element.strokeColor}
        onChange={(e) => update({ strokeColor: e.target.value })}
        className="size-7 cursor-pointer rounded border border-border"
        title="Stroke color"
      />

      {/* Stroke width */}
      <Input
        type="number"
        value={element.strokeWidth}
        onChange={(e) => update({ strokeWidth: Number(e.target.value) })}
        className="h-7 w-14 text-xs"
        min={0}
        max={20}
        title="Stroke width"
      />

      <ToolbarDivider />

      {/* Opacity */}
      <span className="text-[0.6875rem] text-muted-foreground">Opacity</span>
      <div className="w-24">
        <Slider
          value={[element.opacity]}
          onValueChange={([v]) => update({ opacity: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {element.shapeType === "rounded-rect" && (
        <>
          <ToolbarDivider />
          <span className="text-[0.6875rem] text-muted-foreground">Radius</span>
          <div className="w-24">
            <Slider
              value={[element.borderRadius]}
              onValueChange={([v]) => update({ borderRadius: v })}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </>
      )}
    </>
  )
}

function VideoToolbar({ element }: { element: SlideVideoElement }) {
  const update = (updates: Partial<SlideVideoElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <>
      {/* Object fit */}
      <Select
        value={element.objectFit}
        onValueChange={(v) =>
          update({ objectFit: v as SlideVideoElement["objectFit"] })
        }
      >
        <SelectTrigger className="h-7 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cover">Cover</SelectItem>
          <SelectItem value="contain">Contain</SelectItem>
          <SelectItem value="fill">Fill</SelectItem>
        </SelectContent>
      </Select>

      <ToolbarDivider />

      {/* Opacity */}
      <span className="text-[0.6875rem] text-muted-foreground">Opacity</span>
      <div className="w-24">
        <Slider
          value={[element.opacity]}
          onValueChange={([v]) => update({ opacity: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      <ToolbarDivider />

      {/* Border radius */}
      <span className="text-[0.6875rem] text-muted-foreground">Radius</span>
      <div className="w-24">
        <Slider
          value={[element.borderRadius]}
          onValueChange={([v]) => update({ borderRadius: v })}
          min={0}
          max={100}
          step={1}
        />
      </div>
    </>
  )
}

export function SlideFormatToolbar({
  element,
}: {
  element: SlideElement | null
}) {
  if (!element) {
    return (
      <div className="flex h-10 items-center border-b border-border bg-card px-3">
        <span className="text-xs text-muted-foreground">
          Select an element to format
        </span>
      </div>
    )
  }

  const elType = element.type ?? "text"

  return (
    <div className="flex h-10 items-center gap-1 overflow-x-auto border-b border-border bg-card px-3">
      {elType === "text" && (
        <TextToolbar element={element as SlideTextElement} />
      )}
      {elType === "scripture" && (
        <ScriptureToolbar element={element as SlideScriptureElement} />
      )}
      {elType === "image" && (
        <ImageToolbar element={element as SlideImageElement} />
      )}
      {elType === "shape" && (
        <ShapeToolbar element={element as SlideShapeElement} />
      )}
      {elType === "video" && (
        <VideoToolbar element={element as SlideVideoElement} />
      )}
    </div>
  )
}
