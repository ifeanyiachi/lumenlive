import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { VerseEditToolbar } from "./verse-edit-toolbar"
import {
  tiptapToStyledSegments,
  styledSegmentsToTiptapContent,
} from "@/lib/tiptap-conversion"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { openSettings } from "@/lib/settings-dialog"
import { verseEditKey } from "@/types/verse-edit"
import type { StyledVerseSegment } from "@/types/verse-edit"
import type { Verse } from "@/types/bible"
import type { VerseRenderData } from "@/types/broadcast"
import { toast } from "sonner"

interface VerseEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  verse: Verse
  translationAbbreviation: string
  translationId: number
}

export function VerseEditModal({
  open,
  onOpenChange,
  verse,
  translationAbbreviation,
  translationId,
}: VerseEditModalProps) {
  const editKey = verseEditKey(
    translationId,
    verse.book_number,
    verse.chapter,
    verse.verse
  )
  const reference = `${verse.book_name} ${verse.chapter}:${verse.verse} (${translationAbbreviation})`

  const existingEdit = useVerseEditStore((s) => s.edits[editKey])
  const goLiveEnabled = useVerseEditStore((s) => s.goLiveEnabled)
  const setGoLiveEnabled = useVerseEditStore((s) => s.setGoLiveEnabled)
  const saveEdit = useVerseEditStore((s) => s.saveEdit)
  const deleteEdit = useVerseEditStore((s) => s.deleteEdit)
  const editCount = useVerseEditStore((s) => Object.keys(s.edits).length)

  const baseSegments = useMemo<StyledVerseSegment[]>(
    () => [{ verseNumber: verse.verse, text: verse.text }],
    [verse]
  )

  const initialContent = useMemo(() => {
    if (existingEdit) {
      return styledSegmentsToTiptapContent(existingEdit.segments)
    }
    return styledSegmentsToTiptapContent(baseSegments)
  }, [existingEdit, baseSegments])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        listItem: false,
        hardBreak: false,
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[100px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
      },
    },
  })

  const [textChanged, setTextChanged] = useState(false)

  // Reset editor content when modal opens with different verse
  useEffect(() => {
    if (open && editor) {
      const content = existingEdit
        ? styledSegmentsToTiptapContent(existingEdit.segments)
        : styledSegmentsToTiptapContent(baseSegments)
      editor.commands.setContent(content)

      // Detect if verse text changed since last edit was saved
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTextChanged(!!existingEdit && existingEdit.originalText !== verse.text)

      // Focus editor after content loads
      requestAnimationFrame(() => editor.commands.focus())
    }
  }, [open, verse.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: convert editor state to VerseRenderData on each change
  const [previewData, setPreviewData] = useState<VerseRenderData | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const updatePreview = useCallback(() => {
    if (!editor) return
    const json = editor.getJSON()
    const segments = tiptapToStyledSegments(json, baseSegments)
    setPreviewData({ reference, segments })
  }, [editor, baseSegments, reference])

  useEffect(() => {
    if (!editor) return
    // Seed the preview from current editor content, then subscribe to changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updatePreview()
    const handler = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(updatePreview, 200)
    }
    editor.on("update", handler)
    return () => {
      editor.off("update", handler)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [editor, updatePreview])

  const activeTheme = useBroadcastStore((s) => {
    const theme = s.themes.find(
      (t) => t.id === s.outputs.find((o) => o.id === "main")?.themeId
    )
    return theme ?? s.themes[0]
  })

  const handleReset = useCallback(() => {
    if (!editor) return
    editor.commands.setContent(styledSegmentsToTiptapContent(baseSegments))
  }, [editor, baseSegments])

  const handleDeleteEdit = useCallback(() => {
    deleteEdit(editKey)
    if (editor) {
      editor.commands.setContent(styledSegmentsToTiptapContent(baseSegments))
    }
    toast.success("Saved formatting deleted")
  }, [deleteEdit, editKey, editor, baseSegments])

  const handleSchedule = useCallback(() => {
    if (!editor) return
    const json = editor.getJSON()
    const segments = tiptapToStyledSegments(json, baseSegments)

    saveEdit({
      key: editKey,
      reference,
      originalText: verse.text,
      segments,
      createdAt: existingEdit?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })

    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (activeScheduleId) {
      const ok = scheduleStore.addItem(activeScheduleId, {
        id: crypto.randomUUID(),
        type: "scripture",
        label: reference,
        order: scheduleStore.getActiveSchedule()?.items.length ?? 0,
        notes: "",
        translationId,
        bookNumber: verse.book_number,
        chapter: verse.chapter,
        verseStart: verse.verse,
        verseEnd: verse.verse,
        cachedReference: reference,
        cachedText: verse.text,
      })
      if (ok) toast.success("Added to schedule")
      else toast.info("Verse edit saved · already in the schedule")
    } else {
      toast.info("Verse edit saved (no active schedule)")
    }

    if (goLiveEnabled) {
      const renderData: VerseRenderData = { reference, segments }
      useBroadcastStore.getState().setLiveVerse(renderData, "manual")
    }

    onOpenChange(false)
  }, [
    editor,
    baseSegments,
    editKey,
    reference,
    verse,
    translationId,
    existingEdit,
    goLiveEnabled,
    saveEdit,
    onOpenChange,
  ])

  // Ctrl+Enter → quick schedule
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSchedule()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, handleSchedule])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Verse — {reference}</DialogTitle>
        </DialogHeader>

        {textChanged && (
          <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-xs text-amber-300">
              The verse text has changed since your last edit.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleReset}
            >
              Reset to current
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <VerseEditToolbar editor={editor} />
          <EditorContent editor={editor} />

          {activeTheme && previewData && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Preview</span>
              <CanvasVerse
                theme={activeTheme}
                verse={previewData}
                className="rounded-lg border border-border"
              />
            </div>
          )}

          {editCount > 0 && (
            <button
              type="button"
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                onOpenChange(false)
                openSettings("saved-edits")
              }}
            >
              Manage saved edits ({editCount})
            </button>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset to Original
            </Button>
            {existingEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleDeleteEdit}
              >
                Delete Saved Edit
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="go-live-toggle"
                className="text-xs text-muted-foreground"
              >
                Go Live
              </label>
              <Switch
                id="go-live-toggle"
                checked={goLiveEnabled}
                onCheckedChange={setGoLiveEnabled}
              />
            </div>
            <Button onClick={handleSchedule} title="Schedule (Ctrl+Enter)">
              Schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
