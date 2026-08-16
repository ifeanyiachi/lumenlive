import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
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
import { buildVerseEditFromSegment } from "@/lib/verse-edit/multi-edit"
import {
  buildMultiVerseReference,
  toMultiVerseRenderData,
} from "@/lib/multi-verse"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { findOutput } from "@/lib/broadcast/output-selectors"
import { useQueueStore } from "@/stores/queue-store"
import { verseEditKey } from "@/types/verse-edit"
import type { StyledVerseSegment } from "@/types/verse-edit"
import type { Verse } from "@/types/bible"
import type { VerseRenderData } from "@/types/broadcast"
import { toast } from "sonner"

interface MultiVerseEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  verses: Verse[]
  translationAbbreviation: string
  /** Called after edits are saved (e.g. to clear the selection). */
  onApplied?: () => void
}

// Shared TipTap configuration — mirrors the single-verse editor so both behave
// identically (plain rich text: bold/italic/underline/color/highlight only).
const EDITOR_EXTENSIONS = [
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
]

const baseSegmentFor = (verse: Verse): StyledVerseSegment => ({
  verseNumber: verse.verse,
  text: verse.text,
})

/** Read the current segment (edited text + spans) out of one verse's editor. */
function segmentFromEditor(editor: Editor, verse: Verse): StyledVerseSegment {
  const [seg] = tiptapToStyledSegments(editor.getJSON(), [
    baseSegmentFor(verse),
  ])
  return seg
}

/**
 * Edit several selected verses together. Each verse gets its own TipTap editor
 * (behaving exactly like the single-verse editor) so the full verse text is
 * present and individually editable; a shared toolbar formats whichever editor
 * has focus, a combined preview shows the block, and Save writes one per-verse
 * VerseEdit.
 */
export function MultiVerseEditModal({
  open,
  onOpenChange,
  verses,
  translationAbbreviation,
  onApplied,
}: MultiVerseEditModalProps) {
  const saveEdit = useVerseEditStore((s) => s.saveEdit)
  const goLiveEnabled = useVerseEditStore((s) => s.goLiveEnabled)
  const setGoLiveEnabled = useVerseEditStore((s) => s.setGoLiveEnabled)

  // verse.id → its editor instance. Refs (not state) so re-registering an editor
  // doesn't re-render the whole modal on every keystroke.
  const editorsRef = useRef<Map<number, Editor>>(new Map())
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  const [previewData, setPreviewData] = useState<VerseRenderData | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeTheme = useBroadcastStore((s) => {
    const theme = s.themes.find(
      (t) => t.id === findOutput(s.outputs, "main")?.themeId
    )
    return theme ?? s.themes[0]
  })

  const recomputePreview = useCallback(() => {
    const segments: StyledVerseSegment[] = verses.map((v) => {
      const editor = editorsRef.current.get(v.id)
      return editor ? segmentFromEditor(editor, v) : baseSegmentFor(v)
    })
    setPreviewData({
      reference: buildMultiVerseReference(verses, translationAbbreviation),
      segments,
    })
  }, [verses, translationAbbreviation])

  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(recomputePreview, 150)
  }, [recomputePreview])

  const registerEditor = useCallback(
    (verseId: number, editor: Editor | null) => {
      if (editor) {
        editorsRef.current.set(verseId, editor)
        setActiveEditor((current) => current ?? editor)
      } else {
        editorsRef.current.delete(verseId)
      }
      schedulePreview()
    },
    [schedulePreview]
  )

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
  }, [])

  const handleResetAll = useCallback(() => {
    for (const v of verses) {
      const editor = editorsRef.current.get(v.id)
      editor?.commands.setContent(
        styledSegmentsToTiptapContent([baseSegmentFor(v)])
      )
    }
    schedulePreview()
  }, [verses, schedulePreview])

  // Persist each verse's current editor content as its own saved VerseEdit.
  const persistEdits = useCallback(() => {
    const now = Date.now()
    const store = useVerseEditStore.getState()
    for (const v of verses) {
      const editor = editorsRef.current.get(v.id)
      if (!editor) continue
      const key = verseEditKey(
        v.translation_id,
        v.book_number,
        v.chapter,
        v.verse
      )
      saveEdit(
        buildVerseEditFromSegment({
          key,
          reference: `${v.book_name} ${v.chapter}:${v.verse} (${translationAbbreviation})`,
          originalText: v.text,
          segment: segmentFromEditor(editor, v),
          createdAt: store.getEdit(key)?.createdAt,
          now,
        })
      )
    }
  }, [verses, translationAbbreviation, saveEdit])

  const handleSave = useCallback(() => {
    persistEdits()
    toast.success(`Saved edits for ${verses.length} verses`)
    if (goLiveEnabled) {
      // toMultiVerseRenderData reads the edits we just saved, so the live block
      // reflects this formatting.
      const renderData = toMultiVerseRenderData(verses, translationAbbreviation)
      useBroadcastStore.getState().setLiveVerse(renderData, "manual")
    }
    onApplied?.()
    onOpenChange(false)
  }, [
    persistEdits,
    verses,
    translationAbbreviation,
    goLiveEnabled,
    onApplied,
    onOpenChange,
  ])

  // Save edits, then add the selected verses to the queue as one grouped item
  // (mirrors the multi-select bar's "Queue group"), so the queued block carries
  // this formatting.
  const handleQueueGroup = useCallback(() => {
    if (verses.length === 0) return
    persistEdits()
    useQueueStore.getState().addItem({
      id: crypto.randomUUID(),
      verse: verses[0],
      verses,
      reference: buildMultiVerseReference(verses, translationAbbreviation),
      confidence: 1,
      source: "manual",
      added_at: Date.now(),
    })
    toast.success(`Queued group of ${verses.length} verses`)
    onApplied?.()
    onOpenChange(false)
  }, [persistEdits, verses, translationAbbreviation, onApplied, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {verses.length} verses</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <VerseEditToolbar editor={activeEditor} />

          <div className="flex flex-col gap-3">
            {verses.map((verse) => (
              <VerseSubEditor
                key={verse.id}
                verse={verse}
                translationAbbreviation={translationAbbreviation}
                onRegister={registerEditor}
                onFocusEditor={setActiveEditor}
                onUpdate={schedulePreview}
              />
            ))}
          </div>

          {activeTheme && previewData && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Preview</span>
              <CanvasVerse
                theme={activeTheme}
                verse={previewData}
                verseAutoFit
                className="rounded-lg border border-border"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleResetAll}>
            Reset to Original
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="multi-go-live"
                className="text-xs text-muted-foreground"
              >
                Go Live
              </label>
              <Switch
                id="multi-go-live"
                checked={goLiveEnabled}
                onCheckedChange={setGoLiveEnabled}
              />
            </div>
            <Button variant="outline" onClick={handleQueueGroup}>
              Queue group
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One verse's editor within the multi-verse modal. Owns its own TipTap instance
 * (mirroring the single-verse editor), reports it up on mount so the parent can
 * bind the shared toolbar and collect content on save, and preloads any saved
 * edit for the verse.
 */
function VerseSubEditor({
  verse,
  translationAbbreviation,
  onRegister,
  onFocusEditor,
  onUpdate,
}: {
  verse: Verse
  translationAbbreviation: string
  onRegister: (verseId: number, editor: Editor | null) => void
  onFocusEditor: (editor: Editor) => void
  onUpdate: () => void
}) {
  const editKey = verseEditKey(
    verse.translation_id,
    verse.book_number,
    verse.chapter,
    verse.verse
  )
  const reference = `${verse.book_name} ${verse.chapter}:${verse.verse} (${translationAbbreviation})`

  // Preload the saved edit if one exists, else the plain verse. Computed once on
  // mount (verse edits are hydrated at app start).
  const initialContent = useMemo(() => {
    const existing = useVerseEditStore.getState().getEdit(editKey)
    return styledSegmentsToTiptapContent(
      existing ? existing.segments : [baseSegmentFor(verse)]
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[52px] max-h-[160px] overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
      },
    },
    onFocus: ({ editor: focused }) => onFocusEditor(focused),
    onUpdate,
  })

  useEffect(() => {
    onRegister(verse.id, editor)
    return () => onRegister(verse.id, null)
  }, [editor, verse.id, onRegister])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {reference}
      </span>
      <EditorContent editor={editor} />
    </div>
  )
}
