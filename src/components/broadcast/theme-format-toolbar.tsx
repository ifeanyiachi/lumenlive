import { useBroadcastStore } from "@/stores/broadcast-store"
import { FontFamilyPicker } from "@/components/shared/font-family-picker"
import {
  ToolbarDivider,
  ToolbarToggle,
  ToolbarAlignButton,
} from "@/components/shared/toolbar-primitives"
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
} from "lucide-react"
import type { TextHorizontalAlign, TextTransform } from "@/types/broadcast"

function VerseToolbar() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const updateDraftNested = useBroadcastStore((s) => s.updateDraftNested)
  if (!draftTheme) return null

  const v = draftTheme.verseText

  return (
    <>
      <div className="w-36">
        <FontFamilyPicker
          value={v.fontFamily}
          onChange={(f) => updateDraftNested("verseText.fontFamily", f)}
        />
      </div>

      <Input
        type="number"
        value={v.fontSize}
        onChange={(e) =>
          updateDraftNested("verseText.fontSize", Number(e.target.value))
        }
        className="h-7 w-16 text-xs"
        min={8}
        max={200}
      />

      <Select
        value={String(v.fontWeight)}
        onValueChange={(w) =>
          updateDraftNested("verseText.fontWeight", Number(w))
        }
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

      <input
        type="color"
        value={v.color}
        onChange={(e) => updateDraftNested("verseText.color", e.target.value)}
        className="size-7 cursor-pointer rounded border border-border"
        title="Verse color"
      />

      <ToolbarDivider />

      <ToolbarToggle
        active={v.fontWeight >= 700}
        onClick={() =>
          updateDraftNested(
            "verseText.fontWeight",
            v.fontWeight >= 700 ? 400 : 700
          )
        }
        icon={BoldIcon}
        title="Bold"
      />
      <ToolbarToggle
        active={v.fontStyle === "italic"}
        onClick={() =>
          updateDraftNested(
            "verseText.fontStyle",
            v.fontStyle === "italic" ? "normal" : "italic"
          )
        }
        icon={ItalicIcon}
        title="Italic"
      />
      <ToolbarToggle
        active={v.textDecoration === "underline"}
        onClick={() =>
          updateDraftNested(
            "verseText.textDecoration",
            v.textDecoration === "underline" ? "none" : "underline"
          )
        }
        icon={UnderlineIcon}
        title="Underline"
      />

      <ToolbarDivider />

      <Select
        value={v.textTransform ?? "none"}
        onValueChange={(t) =>
          updateDraftNested("verseText.textTransform", t as TextTransform)
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

      <ToolbarAlignButton
        active={(v.horizontalAlign ?? "center") === "left"}
        onClick={() =>
          updateDraftNested(
            "verseText.horizontalAlign",
            "left" as TextHorizontalAlign
          )
        }
        icon={AlignLeftIcon}
        title="Align left"
      />
      <ToolbarAlignButton
        active={(v.horizontalAlign ?? "center") === "center"}
        onClick={() =>
          updateDraftNested(
            "verseText.horizontalAlign",
            "center" as TextHorizontalAlign
          )
        }
        icon={AlignCenterIcon}
        title="Align center"
      />
      <ToolbarAlignButton
        active={(v.horizontalAlign ?? "center") === "right"}
        onClick={() =>
          updateDraftNested(
            "verseText.horizontalAlign",
            "right" as TextHorizontalAlign
          )
        }
        icon={AlignRightIcon}
        title="Align right"
      />
    </>
  )
}

function ReferenceToolbar() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const updateDraftNested = useBroadcastStore((s) => s.updateDraftNested)
  if (!draftTheme) return null

  const r = draftTheme.reference

  return (
    <>
      <div className="w-36">
        <FontFamilyPicker
          value={r.fontFamily}
          onChange={(f) => updateDraftNested("reference.fontFamily", f)}
        />
      </div>

      <Input
        type="number"
        value={r.fontSize}
        onChange={(e) =>
          updateDraftNested("reference.fontSize", Number(e.target.value))
        }
        className="h-7 w-16 text-xs"
        min={8}
        max={200}
      />

      <Select
        value={String(r.fontWeight)}
        onValueChange={(w) =>
          updateDraftNested("reference.fontWeight", Number(w))
        }
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

      <input
        type="color"
        value={r.color}
        onChange={(e) => updateDraftNested("reference.color", e.target.value)}
        className="size-7 cursor-pointer rounded border border-border"
        title="Reference color"
      />

      <ToolbarDivider />

      <ToolbarToggle
        active={r.fontWeight >= 700}
        onClick={() =>
          updateDraftNested(
            "reference.fontWeight",
            r.fontWeight >= 700 ? 400 : 700
          )
        }
        icon={BoldIcon}
        title="Bold"
      />
      <ToolbarToggle
        active={r.fontStyle === "italic"}
        onClick={() =>
          updateDraftNested(
            "reference.fontStyle",
            r.fontStyle === "italic" ? "normal" : "italic"
          )
        }
        icon={ItalicIcon}
        title="Italic"
      />
      <ToolbarToggle
        active={r.textDecoration === "underline"}
        onClick={() =>
          updateDraftNested(
            "reference.textDecoration",
            r.textDecoration === "underline" ? "none" : "underline"
          )
        }
        icon={UnderlineIcon}
        title="Underline"
      />

      <ToolbarDivider />

      <ToolbarAlignButton
        active={(r.horizontalAlign ?? "center") === "left"}
        onClick={() =>
          updateDraftNested(
            "reference.horizontalAlign",
            "left" as TextHorizontalAlign
          )
        }
        icon={AlignLeftIcon}
        title="Align left"
      />
      <ToolbarAlignButton
        active={(r.horizontalAlign ?? "center") === "center"}
        onClick={() =>
          updateDraftNested(
            "reference.horizontalAlign",
            "center" as TextHorizontalAlign
          )
        }
        icon={AlignCenterIcon}
        title="Align center"
      />
      <ToolbarAlignButton
        active={(r.horizontalAlign ?? "center") === "right"}
        onClick={() =>
          updateDraftNested(
            "reference.horizontalAlign",
            "right" as TextHorizontalAlign
          )
        }
        icon={AlignRightIcon}
        title="Align right"
      />
    </>
  )
}

export function ThemeFormatToolbar() {
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const draftTheme = useBroadcastStore((s) => s.draftTheme)

  if (!draftTheme) {
    return (
      <div
        className="flex h-10 items-center border-b border-border/40 px-3"
        style={{ background: "#18181b" }}
      >
        <span className="text-xs text-muted-foreground">
          Select a theme to edit
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex h-10 items-center gap-1 overflow-x-auto border-b border-border/40 px-3"
      style={{ background: "#18181b" }}
    >
      {selectedElement === "verse" && <VerseToolbar />}
      {selectedElement === "reference" && <ReferenceToolbar />}
      {!selectedElement && (
        <span className="text-xs text-muted-foreground">
          Select an element to format
        </span>
      )}
    </div>
  )
}
