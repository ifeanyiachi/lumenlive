import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
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
import { buildScriptureScheduleItem } from "@/lib/search/schedule-items"
import { useSettingsStore } from "@/stores/settings-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { findOutput } from "@/lib/broadcast/output-selectors"
import { useBroadcastStore } from "@/stores/broadcast-store"
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

/**
 * Format a single verse and add it to the schedule (optionally straight to
 * live). The styling is **item-scoped**: it rides on the schedule item created
 * here and is stored nowhere else, so it never affects the same verse elsewhere.
 * Closing without adding (or going live) discards the edit entirely.
 */
export function VerseEditModal({
  open,
  onOpenChange,
  verse,
  translationAbbreviation,
  translationId,
}: VerseEditModalProps) {
  const { t } = useTranslation("verse-edit")
  const reference = `${verse.book_name} ${verse.chapter}:${verse.verse} (${translationAbbreviation})`

  const goLiveEnabled = useSettingsStore((s) => s.verseEditGoLive)
  const setGoLiveEnabled = useSettingsStore((s) => s.setVerseEditGoLive)

  const baseSegments = useMemo<StyledVerseSegment[]>(
    () => [{ verseNumber: verse.verse, text: verse.text }],
    [verse]
  )

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
    content: styledSegmentsToTiptapContent(baseSegments),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[100px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background p-4 text-sm leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
      },
    },
  })

  // Reset editor content when modal opens with a different verse.
  useEffect(() => {
    if (open && editor) {
      editor.commands.setContent(styledSegmentsToTiptapContent(baseSegments))
      requestAnimationFrame(() => editor.commands.focus())
    }
  }, [open, verse.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live preview: convert editor state to VerseRenderData on each change.
  const [previewData, setPreviewData] = useState<VerseRenderData | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const updatePreview = useCallback(() => {
    if (!editor) return
    const [segment] = tiptapToStyledSegments(editor.getJSON(), baseSegments)
    setPreviewData({ reference, segments: [segment] })
  }, [editor, baseSegments, reference])

  useEffect(() => {
    if (!editor) return
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

  // The main output's theme id (legacy namespace) — ScripturePreview resolves it
  // through the alias to a scripture Theme and renders on the slide path, matching
  // the audience output (themeredo.md, VR4 wave 3A).
  const activeThemeId = useBroadcastStore(
    (s) => findOutput(s.outputs, "main")?.themeId
  )

  const handleReset = useCallback(() => {
    if (!editor) return
    editor.commands.setContent(styledSegmentsToTiptapContent(baseSegments))
  }, [editor, baseSegments])

  const handleSchedule = useCallback(() => {
    if (!editor) return
    const [segment] = tiptapToStyledSegments(editor.getJSON(), baseSegments)
    // Only attach the edit when the operator actually changed something; an
    // untouched verse adds as a plain item.
    const edited =
      (segment.spans?.length ?? 0) > 0 || segment.text !== verse.text

    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (activeScheduleId) {
      const item = buildScriptureScheduleItem(
        { ...verse, translation_id: translationId },
        translationAbbreviation,
        scheduleStore.getActiveSchedule()?.items.length ?? 0,
        edited ? segment : undefined
      )
      const ok = scheduleStore.addItem(activeScheduleId, item)
      if (ok) toast.success(t("addedToSchedule"))
      else toast.info(t("alreadyInSchedule"))
    } else {
      toast.info(t("noActiveSchedule"))
    }

    if (goLiveEnabled) {
      const renderData: VerseRenderData = { reference, segments: [segment] }
      useBroadcastStore.getState().setLiveVerse(renderData, "manual")
    }

    onOpenChange(false)
  }, [
    editor,
    baseSegments,
    reference,
    verse,
    translationId,
    translationAbbreviation,
    goLiveEnabled,
    onOpenChange,
    t,
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
          <DialogTitle>{t("editVerse", { reference })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <VerseEditToolbar editor={editor} />
          <EditorContent editor={editor} />

          {previewData && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("preview")}
              </span>
              <ScripturePreview
                themeId={activeThemeId}
                verse={previewData}
                className="rounded-lg border border-border"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            {t("resetToOriginal")}
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="go-live-toggle"
                className="text-xs text-muted-foreground"
              >
                {t("goLive")}
              </label>
              <Switch
                id="go-live-toggle"
                checked={goLiveEnabled}
                onCheckedChange={setGoLiveEnabled}
              />
            </div>
            <Button onClick={handleSchedule} title={t("scheduleShortcut")}>
              {t("schedule")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
