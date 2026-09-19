import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { Editor } from "@tiptap/react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style"
import Color from "@tiptap/extension-color"
import Highlight from "@tiptap/extension-highlight"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { VerseEditToolbar } from "./verse-edit-toolbar"
import {
  tiptapToStyledSegments,
  styledSegmentsToTiptapContent,
} from "@/lib/tiptap-conversion"
import { renderLexiconCardToCanvas } from "@/lib/lexicon-card-renderer"
import {
  buildLexiconSlideFromData,
  buildLexiconScheduleItemFromData,
} from "@/lib/lexicon-slide"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useScheduleStore } from "@/stores/schedule-store"
import type { LexiconCardData, LexiconField } from "@/types/lexicon"
import type { StyledSpan, StyledVerseSegment } from "@/types/verse-edit"

// Shared TipTap configuration — mirrors the verse editor so formatting behaves
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

/** The formattable card fields, in the order they appear on the card. */
const FIELD_LABELS: Array<{ field: LexiconField; labelKey: string }> = [
  { field: "summary", labelKey: "field.summary" },
  { field: "lemma", labelKey: "field.originalWord" },
  { field: "partOfSpeech", labelKey: "field.partOfSpeech" },
  { field: "transliteration", labelKey: "field.transliteration" },
  { field: "pronunciation", labelKey: "field.pronunciation" },
  { field: "kjvUsage", labelKey: "field.kjvUsage" },
  { field: "wordOrigin", labelKey: "field.wordOrigin" },
  { field: "definition", labelKey: "field.definition" },
]

/** Live-preview render scale — see recomputePreview. */
const PREVIEW_SCALE = 0.5

/** A field's current text, seeded from the base card data. */
function fieldText(data: LexiconCardData, field: LexiconField): string {
  return (data[field] as string | undefined) ?? ""
}

/** Read a field editor's current content as { text, spans }. */
function segmentFromEditor(
  editor: Editor,
  baseText: string
): StyledVerseSegment {
  const [seg] = tiptapToStyledSegments(editor.getJSON(), [
    { verseNumber: 0, text: baseText },
  ])
  return seg
}

interface LexiconEditModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolved base card data (unstyled fields + any existing per-field styles). */
  card: LexiconCardData
  /**
   * "create" — from the Lexicon bar: footer shows Preview (stage) + Add to
   * Schedule. "edit" — re-editing a scheduled card: footer shows Save and calls
   * {@link onSaved} with the updated card data.
   */
  mode: "create" | "edit"
  onSaved?: (card: LexiconCardData) => void
}

/**
 * Format a "Lexical Summary" card's text fields inline (bold/italic/underline/
 * color/highlight) with a live preview, then Preview (stage) it, add it to the
 * schedule, or save the edit back onto a scheduled item. Mirrors {@link
 * import("./multi-verse-edit-modal").MultiVerseEditModal}: one TipTap editor per
 * field, a shared toolbar bound to the focused editor, and a debounced preview.
 * Styling is per-card and lives only where it is saved (the projection or the
 * schedule item) — it never touches the source lexicon data.
 */
export function LexiconEditModal({
  open,
  onOpenChange,
  card,
  mode,
  onSaved,
}: LexiconEditModalProps) {
  const { t } = useTranslation("verse-edit")
  // Only fields that actually have text are editable.
  const fields = useMemo(
    () => FIELD_LABELS.filter(({ field }) => fieldText(card, field).length > 0),
    [card]
  )

  // field → its editor instance. Refs (not state) so re-registering doesn't
  // re-render the modal on every keystroke.
  const editorsRef = useRef<Map<LexiconField, Editor>>(new Map())
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Build card data reflecting the editors' current content. */
  const collect = useCallback((): LexiconCardData => {
    const next: LexiconCardData = { ...card }
    const styles: Partial<Record<LexiconField, StyledSpan[]>> = {}
    for (const { field } of fields) {
      const editor = editorsRef.current.get(field)
      if (!editor) continue
      const seg = segmentFromEditor(editor, fieldText(card, field))
      ;(next as Record<LexiconField, string>)[field] = seg.text
      if (seg.spans && seg.spans.length > 0) styles[field] = seg.spans
    }
    next.styles = Object.keys(styles).length > 0 ? styles : undefined
    return next
  }, [card, fields])

  const recomputePreview = useCallback(() => {
    // Draw straight onto the on-screen canvas at half resolution: no React state
    // update (so the editors never re-render) and no base64 image to decode or
    // composite — that combination is what kept text selection from being smooth.
    // The projected card is always rendered at full resolution elsewhere.
    const canvas = previewCanvasRef.current
    if (canvas) renderLexiconCardToCanvas(canvas, collect(), PREVIEW_SCALE)
  }, [collect])

  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    // Rasterizing the full-resolution card + toDataURL is heavy; only run it once
    // typing/selection pauses so it never competes with the editors for the main
    // thread (which made selection feel laggy).
    previewTimer.current = setTimeout(recomputePreview, 300)
  }, [recomputePreview])

  const registerEditor = useCallback(
    (field: LexiconField, editor: Editor | null) => {
      if (editor) {
        editorsRef.current.set(field, editor)
        setActiveEditor((current) => current ?? editor)
      } else {
        editorsRef.current.delete(field)
      }
      schedulePreview()
    },
    [schedulePreview]
  )

  // Paint the initial preview when the modal opens (before any edit).
  useEffect(() => {
    if (!open) return
    const canvas = previewCanvasRef.current
    if (canvas) renderLexiconCardToCanvas(canvas, card, PREVIEW_SCALE)
  }, [open, card])

  useEffect(() => {
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
  }, [])

  const handleReset = useCallback(() => {
    for (const { field } of fields) {
      editorsRef.current
        .get(field)
        ?.commands.setContent(
          styledSegmentsToTiptapContent([
            { verseNumber: 0, text: fieldText(card, field) },
          ])
        )
    }
    schedulePreview()
  }, [card, fields, schedulePreview])

  // Stage the current card to the Program preview (does not touch the audience
  // until the operator takes it live from the preview panel).
  const stagePreview = useCallback((data: LexiconCardData) => {
    useBroadcastStore
      .getState()
      .setLiveSlide(buildLexiconSlideFromData(data), "manual")
  }, [])

  // Add the current card to the active schedule. Returns false (with a toast) if
  // there is no active schedule so callers can bail before also previewing.
  const addToSchedule = useCallback(
    (data: LexiconCardData): boolean => {
      const scheduleStore = useScheduleStore.getState()
      const scheduleId = scheduleStore.activeScheduleId
      if (!scheduleId) {
        toast.error(t("selectOrCreateSchedule"))
        return false
      }
      const order = scheduleStore.getActiveSchedule()?.items.length ?? 0
      const item = buildLexiconScheduleItemFromData(data, order)
      const added = scheduleStore.addItem(scheduleId, item)
      if (added)
        toast.success(
          t("addedReferenceToSchedule", { reference: item.reference })
        )
      else toast.info(t("alreadyInSchedule"))
      return true
    },
    [t]
  )

  const handlePreview = useCallback(() => {
    const data = collect()
    stagePreview(data)
    toast.success(t("previewing", { name: data.lemma }))
    onOpenChange(false)
  }, [collect, stagePreview, onOpenChange, t])

  const handleAddToSchedule = useCallback(() => {
    if (addToSchedule(collect())) onOpenChange(false)
  }, [collect, addToSchedule, onOpenChange])

  const handleScheduleAndPreview = useCallback(() => {
    const data = collect()
    if (!addToSchedule(data)) return
    stagePreview(data)
    onOpenChange(false)
  }, [collect, addToSchedule, stagePreview, onOpenChange])

  const handleSave = useCallback(() => {
    onSaved?.(collect())
    onOpenChange(false)
  }, [collect, onSaved, onOpenChange])

  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        // This modal is opened from inside a verse row that spreads
        // `useDragSource()` pointer handlers (the interlinear LexiconBar is a
        // React-tree descendant of that row). React synthetic events bubble
        // through the React tree even across the dialog's portal, so a
        // pointer-drag to select text in the field editors would reach the
        // row's drag handler, trip its 6px threshold, and `setPointerCapture` —
        // killing the selection after ~1-2 chars. Stop pointer-downs at the
        // modal boundary so text selection (and any other pointer gesture
        // inside the modal) never starts an ancestor drag.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {t("lexicalSummary", { reference: card.reference })}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("preview")}
            </span>
            <canvas
              ref={previewCanvasRef}
              className="aspect-video w-full rounded-lg border border-border bg-[#f8fafc]"
            />
          </div>

          <VerseEditToolbar editor={activeEditor} />

          <div className="flex flex-col gap-3">
            {fields.map(({ field, labelKey }) => (
              <LexiconFieldEditor
                key={field}
                field={field}
                label={t(labelKey)}
                text={fieldText(card, field)}
                spans={card.styles?.[field]}
                onRegister={registerEditor}
                onFocusEditor={setActiveEditor}
                onUpdate={schedulePreview}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            {t("resetToOriginal")}
          </Button>
          <div className="flex items-center gap-2">
            {mode === "edit" ? (
              <Button onClick={handleSave}>{t("save")}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handlePreview}>
                  {t("preview")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAddToSchedule}
                  disabled={!activeScheduleId}
                  title={
                    activeScheduleId
                      ? t("addLexicalSummary")
                      : t("selectOrCreateSchedule")
                  }
                >
                  {t("addToSchedule")}
                </Button>
                <Button
                  onClick={handleScheduleAndPreview}
                  disabled={!activeScheduleId}
                  title={
                    activeScheduleId
                      ? t("scheduleAndPreviewTitle")
                      : t("selectOrCreateSchedule")
                  }
                >
                  {t("scheduleAndPreview")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One card field's editor. Owns its TipTap instance (mirroring the verse
 * sub-editor), reports it up on mount so the parent can bind the shared toolbar
 * and collect content, and preloads any existing per-field styling.
 *
 * Memoized: its props are all stable for the life of the modal, so a preview
 * refresh (which updates parent state every ~300ms while typing) never re-renders
 * these editors — that churn was what made text selection feel laggy.
 */
const LexiconFieldEditor = memo(function LexiconFieldEditor({
  field,
  label,
  text,
  spans,
  onRegister,
  onFocusEditor,
  onUpdate,
}: {
  field: LexiconField
  label: string
  text: string
  spans?: StyledSpan[]
  onRegister: (field: LexiconField, editor: Editor | null) => void
  onFocusEditor: (editor: Editor) => void
  onUpdate: () => void
}) {
  // Seed from the field's stored styling if present, else plain text. Once.
  const initialContent = useMemo(
    () => styledSegmentsToTiptapContent([{ verseNumber: 0, text, spans }]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[44px] max-h-[160px] overflow-y-auto rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
      },
    },
    onFocus: ({ editor: focused }) => onFocusEditor(focused),
    onUpdate,
  })

  useEffect(() => {
    onRegister(field, editor)
    return () => onRegister(field, null)
  }, [editor, field, onRegister])

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <EditorContent editor={editor} />
    </div>
  )
})
