import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { ScripturePreview } from "@/components/ui/scripture-preview"
import { VerseEditToolbar } from "./verse-edit-toolbar"
import {
  tiptapToStyledSegments,
  styledSegmentsToTiptapContent,
} from "@/lib/tiptap-conversion"
import { buildMultiVerseReference } from "@/lib/multi-verse"
import { buildGroupedScriptureScheduleItem } from "@/lib/search/schedule-items"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { takeToLiveOrPrompt } from "@/hooks/use-broadcast"
import { useScheduleStore } from "@/stores/schedule-store"
import { useSettingsStore } from "@/stores/settings-store"
import { findOutput } from "@/lib/broadcast/output-selectors"
import type { StyledVerseSegment } from "@/types/verse-edit"
import type { Verse } from "@/types/bible"
import type { VerseRenderData } from "@/types/broadcast"
import { toast } from "sonner"

interface MultiVerseEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  verses: Verse[]
  translationAbbreviation: string
  /** Called after edits are applied (e.g. to clear the selection). */
  onApplied?: () => void
  /**
   * Seed each verse's editor from an existing item-scoped edit (used when editing
   * a scripture schedule item already in the running order). Returns the stored
   * segment for a verse, or undefined to start from the plain verse text.
   */
  initialSegmentFor?: (verse: Verse) => StyledVerseSegment | undefined
  /**
   * Overrides the default "add a new grouped scripture item" action. When set,
   * the footer button reads "Save" and this fires with the edited block; the
   * modal adds nothing to the running order itself. `segmentById` maps `verse.id`
   * → its styled edit for the verses the operator actually formatted (unedited
   * verses are omitted). Used to edit an existing scripture item in place — the
   * edits are stored on the item, never a global store.
   */
  onSave?: (result: {
    reference: string
    renderData: VerseRenderData
    segmentById: Map<number, StyledVerseSegment>
  }) => void
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

/** True when a verse's segment carries styling or its text was changed. */
function isEdited(seg: StyledVerseSegment, verse: Verse): boolean {
  return (seg.spans?.length ?? 0) > 0 || seg.text !== verse.text
}

const sortCanonical = (verses: Verse[]): Verse[] =>
  [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })

/**
 * Edit several selected verses together. Each verse gets its own TipTap editor
 * (behaving exactly like the single-verse editor) so the full verse text is
 * present and individually editable; a shared toolbar formats whichever editor
 * has focus, and a combined preview shows the block. Edits are **item-scoped**:
 * they ride on the schedule item created (or updated) here, never a global store,
 * and are discarded if the block is neither added to a schedule nor sent live.
 */
export function MultiVerseEditModal({
  open,
  onOpenChange,
  verses,
  translationAbbreviation,
  onApplied,
  initialSegmentFor,
  onSave,
}: MultiVerseEditModalProps) {
  const { t } = useTranslation("verse-edit")
  const goLiveEnabled = useSettingsStore((s) => s.verseEditGoLive)
  const setGoLiveEnabled = useSettingsStore((s) => s.setVerseEditGoLive)

  // verse.id → its editor instance. Refs (not state) so re-registering an editor
  // doesn't re-render the whole modal on every keystroke.
  const editorsRef = useRef<Map<number, Editor>>(new Map())
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  const [previewData, setPreviewData] = useState<VerseRenderData | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The main output's theme id (legacy namespace) — ScripturePreview resolves it
  // through the alias to a scripture Theme and renders on the slide path, matching
  // the audience output (themeredo.md, VR4 wave 3A).
  const activeThemeId = useBroadcastStore(
    (s) => findOutput(s.outputs, "main")?.themeId
  )

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

  // Collect each verse's current editor content: the full ordered segments (for
  // the live block) plus a map of only the verses that were actually formatted
  // (for the schedule item — unedited verses fall back to plain text).
  const collect = useCallback(() => {
    const sorted = sortCanonical(verses)
    const segmentById = new Map<number, StyledVerseSegment>()
    const segments: StyledVerseSegment[] = sorted.map((v) => {
      const editor = editorsRef.current.get(v.id)
      const seg = editor ? segmentFromEditor(editor, v) : baseSegmentFor(v)
      if (isEdited(seg, v)) segmentById.set(v.id, seg)
      return seg
    })
    const renderData: VerseRenderData = {
      reference: buildMultiVerseReference(sorted, translationAbbreviation),
      segments,
    }
    return { segmentById, renderData }
  }, [verses, translationAbbreviation])

  // Apply the edits: hand them back to an edit-in-place caller, or add the block
  // to the running order as one grouped scripture item carrying its edits. When
  // Go Live is on, the block is also pushed straight to the audience.
  const handleApply = useCallback(() => {
    const { segmentById, renderData } = collect()

    if (onSave) {
      onSave({ reference: renderData.reference, renderData, segmentById })
    } else {
      const scheduleStore = useScheduleStore.getState()
      const activeScheduleId = scheduleStore.activeScheduleId
      if (activeScheduleId) {
        const schedule = scheduleStore.getActiveSchedule()
        const insertAt =
          scheduleStore.activeItemIndex !== null
            ? scheduleStore.activeItemIndex + 1
            : (schedule?.items.length ?? 0)
        const item = buildGroupedScriptureScheduleItem(
          verses,
          translationAbbreviation,
          insertAt,
          segmentById
        )
        const ok = scheduleStore.insertItemAt(activeScheduleId, item, insertAt)
        if (ok)
          toast.success(t("addedVersesToSchedule", { count: verses.length }))
        else toast.info(t("alreadyInSchedule"))
      } else {
        toast.info(t("noActiveSchedule"))
      }
    }

    if (goLiveEnabled) {
      const broadcast = useBroadcastStore.getState()
      broadcast.setLiveVerse(renderData, "manual")
      // The Go Live option is expected to work even when no broadcast is
      // currently active, so enable the audience output before taking the
      // edited block live.
      if (!broadcast.isLive) broadcast.setLive(true)
      takeToLiveOrPrompt()
    }
    onApplied?.()
    onOpenChange(false)
  }, [
    collect,
    verses,
    translationAbbreviation,
    goLiveEnabled,
    onApplied,
    onOpenChange,
    onSave,
    t,
  ])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editVerses", { count: verses.length })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <VerseEditToolbar editor={activeEditor} />

          <div className="flex flex-col gap-3">
            {verses.map((verse) => (
              <VerseSubEditor
                key={verse.id}
                verse={verse}
                translationAbbreviation={translationAbbreviation}
                initialSegment={initialSegmentFor?.(verse)}
                onRegister={registerEditor}
                onFocusEditor={setActiveEditor}
                onUpdate={schedulePreview}
              />
            ))}
          </div>

          {previewData && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("preview")}
              </span>
              <ScripturePreview
                themeId={activeThemeId}
                verse={previewData}
                verseAutoFit
                className="rounded-lg border border-border"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleResetAll}>
            {t("resetToOriginal")}
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="multi-go-live"
                className="text-xs text-muted-foreground"
              >
                {t("goLive")}
              </label>
              <Switch
                id="multi-go-live"
                checked={goLiveEnabled}
                onCheckedChange={setGoLiveEnabled}
              />
            </div>
            <Button onClick={handleApply}>
              {onSave ? t("save") : t("addToSchedule")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One verse's editor within the multi-verse modal. Owns its own TipTap instance
 * (mirroring the single-verse editor), reports it up on mount so the parent can
 * bind the shared toolbar and collect content on save, and preloads any
 * item-scoped edit passed in `initialSegment`.
 */
function VerseSubEditor({
  verse,
  translationAbbreviation,
  initialSegment,
  onRegister,
  onFocusEditor,
  onUpdate,
}: {
  verse: Verse
  translationAbbreviation: string
  initialSegment?: StyledVerseSegment
  onRegister: (verseId: number, editor: Editor | null) => void
  onFocusEditor: (editor: Editor) => void
  onUpdate: () => void
}) {
  const reference = `${verse.book_name} ${verse.chapter}:${verse.verse} (${translationAbbreviation})`

  // Preload the item's stored edit if one was passed, else the plain verse.
  // Computed once on mount.
  const initialContent = useMemo(() => {
    return styledSegmentsToTiptapContent([
      initialSegment ?? baseSegmentFor(verse),
    ])
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
