import type { Editor } from "@tiptap/react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { ColorMenu } from "@/components/ui/color-picker"
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

interface VerseEditToolbarProps {
  editor: Editor | null
}

export function VerseEditToolbar({ editor }: VerseEditToolbarProps) {
  const { t } = useTranslation("verse-edit")
  if (!editor) return null

  const activeTextColor = editor.getAttributes("textStyle").color as
    string | undefined
  const activeHighlight = editor.getAttributes("highlight").color as
    string | undefined

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
      role="toolbar"
      aria-label={t("textFormatting")}
    >
      <Button
        variant={editor.isActive("bold") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleBold().run()}
        title={t("boldShortcut")}
        aria-label={t("bold")}
        aria-pressed={editor.isActive("bold")}
      >
        <BoldIcon className="size-4" />
      </Button>

      <Button
        variant={editor.isActive("italic") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title={t("italicShortcut")}
        aria-label={t("italic")}
        aria-pressed={editor.isActive("italic")}
      >
        <ItalicIcon className="size-4" />
      </Button>

      <Button
        variant={editor.isActive("underline") ? "default" : "ghost"}
        size="icon-sm"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title={t("underlineShortcut")}
        aria-label={t("underline")}
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
            title={t("textColor")}
            aria-label={t("textColor")}
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
          <ColorMenu
            value={activeTextColor || "#ffffff"}
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
            title={t("highlight")}
            aria-label={t("highlightColor")}
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
          <ColorMenu
            value={activeHighlight || "#facc15"}
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
        title={t("clearFormatting")}
        aria-label={t("clearFormatting")}
      >
        <Undo2Icon className="size-4" />
      </Button>
    </div>
  )
}
