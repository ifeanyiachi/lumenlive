import type { Editor } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  TypeIcon,
  HighlighterIcon,
  Undo2Icon,
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const TEXT_COLORS = [
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#ec4899",
]

const HIGHLIGHT_COLORS = [
  "#facc15",
  "#fb923c",
  "#4ade80",
  "#60a5fa",
  "#f472b6",
  "#c084fc",
  "#f87171",
  "#2dd4bf",
]

interface VerseEditToolbarProps {
  editor: Editor | null
}

function ColorGrid({
  colors,
  activeColor,
  onSelect,
  onClear,
}: {
  colors: string[]
  activeColor: string | undefined
  onSelect: (color: string) => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-2 p-2">
      <div
        className="grid grid-cols-4 gap-1.5"
        role="listbox"
        aria-label="Color options"
      >
        {colors.map((color) => (
          <button
            key={color}
            role="option"
            aria-selected={activeColor === color}
            aria-label={color}
            className={cn(
              "size-7 rounded-md border-2 transition-transform hover:scale-110",
              activeColor === color
                ? "border-primary ring-1 ring-primary"
                : "border-transparent"
            )}
            style={{ backgroundColor: color }}
            onClick={() => onSelect(color)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Custom</span>
          <input
            type="color"
            value={activeColor || "#ffffff"}
            onChange={(e) => onSelect(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
          />
        </label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </div>
  )
}

export function VerseEditToolbar({ editor }: VerseEditToolbarProps) {
  if (!editor) return null

  const activeTextColor = editor.getAttributes("textStyle").color as
    string | undefined
  const activeHighlight = editor.getAttributes("highlight").color as
    string | undefined

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      role="toolbar"
      aria-label="Text formatting"
    >
      <Button
        variant={editor.isActive("bold") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
        aria-pressed={editor.isActive("bold")}
      >
        <BoldIcon className="size-4" />
      </Button>

      <Button
        variant={editor.isActive("italic") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
        aria-pressed={editor.isActive("italic")}
      >
        <ItalicIcon className="size-4" />
      </Button>

      <Button
        variant={editor.isActive("underline") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
        aria-label="Underline"
        aria-pressed={editor.isActive("underline")}
      >
        <UnderlineIcon className="size-4" />
      </Button>

      <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activeTextColor ? "default" : "ghost"}
            size="icon-sm"
            title="Text Color"
            aria-label="Text color"
            className="relative"
          >
            <TypeIcon className="size-4" />
            <span
              className="absolute bottom-0.5 left-1/2 h-0.5 w-3.5 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: activeTextColor || "#ffffff" }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <ColorGrid
            colors={TEXT_COLORS}
            activeColor={activeTextColor}
            onSelect={(color) => editor.chain().focus().setColor(color).run()}
            onClear={() => editor.chain().focus().unsetColor().run()}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activeHighlight ? "default" : "ghost"}
            size="icon-sm"
            title="Highlight"
            aria-label="Highlight color"
            className="relative"
          >
            <HighlighterIcon className="size-4" />
            <span
              className="absolute bottom-0.5 left-1/2 h-0.5 w-3.5 -translate-x-1/2 rounded-full"
              style={{ backgroundColor: activeHighlight || "#facc15" }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <ColorGrid
            colors={HIGHLIGHT_COLORS}
            activeColor={activeHighlight}
            onSelect={(color) =>
              editor.chain().focus().toggleHighlight({ color }).run()
            }
            onClear={() => editor.chain().focus().unsetHighlight().run()}
          />
        </PopoverContent>
      </Popover>

      <div className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => editor.chain().focus().unsetAllMarks().run()}
        title="Clear formatting"
        aria-label="Clear formatting"
      >
        <Undo2Icon className="size-4" />
      </Button>
    </div>
  )
}
