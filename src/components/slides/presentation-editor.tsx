import { useState } from "react"

import { usePresentationStore } from "@/stores/presentation-store"
import { SlideFormatToolbar } from "@/components/slides/slide-format-toolbar"
import { cn } from "@/lib/utils"

import { SlideStrip } from "./editor/slide-strip"
import { EditorToolbar } from "./editor/editor-toolbar"
import { EditorCanvas } from "./editor/editor-canvas"
import { RightPanel } from "./editor/right-panel"
import { useEditorKeyboardShortcuts } from "./editor/hooks/use-editor-keyboard-shortcuts"
import { useSlideEditorCanvas } from "./editor/hooks/use-slide-editor-canvas"

/**
 * Slide/theme editor shell. Owns the top-level layout (slide strip · canvas
 * stage · properties panel) and the small amount of cross-cutting UI state; all
 * section content lives in `components/slides/editor/**`, and the canvas render
 * loops live in `useSlideEditorCanvas`.
 */
export function PresentationEditor({
  onClose,
  embedded = false,
  themeMode = false,
  hideToolbar = false,
  showGrid: controlledShowGrid,
  onShowGridChange,
}: {
  onClose: () => void
  /** Fill the parent instead of a full-screen `fixed inset-0` overlay. */
  embedded?: boolean
  /**
   * Author a single-slide song *theme* rather than a deck: hide the multi-slide
   * strip and deck-only chrome (export/import/apply-theme), and save to the
   * custom-theme collection (theme-unification-plan.md, Phase 4 editor shell).
   */
  themeMode?: boolean
  /**
   * Suppress the built-in `EditorToolbar` so a host (the Theme Designer) can
   * provide a single unified top bar instead of stacking two. When set, the
   * host owns name/undo/redo/save/grid and must control the grid via the
   * `showGrid`/`onShowGridChange` props below.
   */
  hideToolbar?: boolean
  /** Controlled grid-overlay state (used when the toolbar is hidden). */
  showGrid?: boolean
  onShowGridChange?: (updater: (v: boolean) => boolean) => void
}) {
  const draft = usePresentationStore((s) => s.draftPresentation)
  const activeSlideIndex = usePresentationStore((s) => s.activeSlideIndex)
  const selectedElementId = usePresentationStore((s) => s.selectedElementId)
  const editingTextElementId = usePresentationStore(
    (s) => s.editingTextElementId
  )
  const [internalShowGrid, setInternalShowGrid] = useState(false)
  const showGrid = controlledShowGrid ?? internalShowGrid
  const setShowGrid = onShowGridChange ?? setInternalShowGrid

  const activeSlide = draft?.slides[activeSlideIndex] ?? null

  useEditorKeyboardShortcuts()
  const { canvasRef, handlePreviewTransition } = useSlideEditorCanvas(
    activeSlide,
    editingTextElementId
  )

  if (!draft) return null

  const selectedElement =
    activeSlide?.elements.find((e) => e.id === selectedElementId) ?? null

  return (
    <div
      className={cn(
        "flex bg-background",
        embedded ? "h-full min-h-0 w-full" : "fixed inset-0 z-50"
      )}
    >
      {/* Left: Slide strip — a theme is a single slide, so hide it in theme mode */}
      {!themeMode && (
        <SlideStrip onPreviewTransition={handlePreviewTransition} />
      )}

      {/* Center: Canvas preview */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!hideToolbar && (
          <EditorToolbar
            draft={draft}
            activeSlideIndex={activeSlideIndex}
            themeMode={themeMode}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            onClose={onClose}
          />
        )}

        {/* Format toolbar */}
        <SlideFormatToolbar element={selectedElement} />

        <EditorCanvas canvasRef={canvasRef} showGrid={showGrid} />
      </div>

      {/* Right: Tabbed panel */}
      <RightPanel
        activeSlide={activeSlide}
        selectedElementId={selectedElementId}
        selectedElement={selectedElement}
      />
    </div>
  )
}
