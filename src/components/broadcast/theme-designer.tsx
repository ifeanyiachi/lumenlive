import { useEffect, useCallback, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useBroadcastStore } from "@/stores"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SaveIcon,
  TrashIcon,
  XIcon,
  Undo2Icon,
  Redo2Icon,
  RotateCcwIcon,
  PaletteIcon,
} from "lucide-react"
import { DesignCanvas } from "@/components/broadcast/design-canvas"
import { ThemeFormatToolbar } from "@/components/broadcast/theme-format-toolbar"
import { PropertiesPanel } from "@/components/broadcast/properties-panel"
import { ThemeLibrary } from "@/components/broadcast/theme-library"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function ThemeDesigner() {
  const isDesignerOpen = useBroadcastStore((s) => s.isDesignerOpen)
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const canUndo = useBroadcastStore((s) => s.undoStack.length > 0)
  const canRedo = useBroadcastStore((s) => s.redoStack.length > 0)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingNameValue, setEditingNameValue] = useState("")
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const isEditing = draftTheme != null

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isDesignerOpen || !useBroadcastStore.getState().draftTheme) return
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      const store = useBroadcastStore.getState()

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        store.undo()
        return
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.key === "z" && e.shiftKey))
      ) {
        e.preventDefault()
        store.redo()
        return
      }
      if (isInput) return

      const sel = store.selectedElement
      if (!sel) return

      if (e.key === "Delete" || e.key === "Backspace") {
        if (sel !== "verse" && sel !== "reference" && sel !== "textArea") {
          e.preventDefault()
          store.removeElement(sel)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        if (sel !== "verse" && sel !== "reference" && sel !== "textArea") {
          e.preventDefault()
          store.duplicateElement(sel)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault()
        const draft = store.draftTheme
        if (!draft) return
        if (sel === "verse") {
          store.updateDraftNested(
            "verseText.fontWeight",
            draft.verseText.fontWeight >= 700 ? 400 : 700
          )
        } else if (sel === "reference") {
          store.updateDraftNested(
            "reference.fontWeight",
            draft.reference.fontWeight >= 700 ? 400 : 700
          )
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault()
        const draft = store.draftTheme
        if (!draft) return
        if (sel === "verse") {
          store.updateDraftNested(
            "verseText.fontStyle",
            draft.verseText.fontStyle === "italic" ? "normal" : "italic"
          )
        } else if (sel === "reference") {
          store.updateDraftNested(
            "reference.fontStyle",
            draft.reference.fontStyle === "italic" ? "normal" : "italic"
          )
        }
        return
      }

      const step = e.shiftKey ? 10 : 1
      if (e.key === "ArrowUp") {
        e.preventDefault()
        store.nudgeElement(0, -step)
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        store.nudgeElement(0, step)
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        store.nudgeElement(-step, 0)
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        store.nudgeElement(step, 0)
      }
    },
    [isDesignerOpen]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Reset name-editing state whenever the theme being edited changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEditingName(false)
  }, [editingThemeId])

  const handleDiscard = () => {
    setShowDiscardConfirm(true)
  }

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false)
    useBroadcastStore.getState().discardDraft()
  }

  const handleReset = () => {
    useBroadcastStore.getState().discardDraft()
  }

  const handleSave = () => {
    useBroadcastStore.getState().saveDraft()
    toast.success("Theme saved")
  }

  const handleClose = () => {
    useBroadcastStore.getState().setDesignerOpen(false)
  }

  const handleStartEditingName = () => {
    if (draftTheme) {
      setEditingNameValue(draftTheme.name)
      setIsEditingName(true)
    }
  }

  const handleCommitName = () => {
    const trimmed = editingNameValue.trim()
    if (trimmed && draftTheme && editingThemeId) {
      useBroadcastStore.getState().renameTheme(editingThemeId, trimmed)
      useBroadcastStore.getState().updateDraft({ name: trimmed })
    }
    setIsEditingName(false)
  }

  return (
    <DialogPrimitive.Root
      open={isDesignerOpen}
      onOpenChange={(open) =>
        useBroadcastStore.getState().setDesignerOpen(open)
      }
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Theme Designer
          </DialogPrimitive.Title>

          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            {isEditing ? (
              isEditingName ? (
                <Input
                  autoFocus
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  onBlur={handleCommitName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitName()
                    if (e.key === "Escape") {
                      e.stopPropagation()
                      setIsEditingName(false)
                    }
                  }}
                  className="h-8 w-56 text-lg font-semibold"
                />
              ) : (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-lg font-semibold text-foreground",
                    draftTheme &&
                      !draftTheme.builtin &&
                      "cursor-pointer hover:bg-muted"
                  )}
                  onDoubleClick={
                    draftTheme && !draftTheme.builtin
                      ? handleStartEditingName
                      : undefined
                  }
                  title={
                    draftTheme && !draftTheme.builtin
                      ? "Double-click to rename"
                      : undefined
                  }
                >
                  {draftTheme?.name ?? "Theme Editor"}
                </span>
              )
            ) : (
              <span className="text-xl font-semibold text-foreground">
                Theme Designer
              </span>
            )}

            {isEditing && (
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  disabled={!canUndo}
                  onClick={() => useBroadcastStore.getState().undo()}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2Icon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  disabled={!canRedo}
                  onClick={() => useBroadcastStore.getState().redo()}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2Icon className="size-4" />
                </Button>
              </div>
            )}

            <div className="flex-1" />

            {isEditing && (
              <>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  title="Reset changes and stay in editor"
                >
                  <RotateCcwIcon className="size-4" />
                  Reset
                </Button>
                <Button variant="outline" onClick={handleDiscard}>
                  <TrashIcon className="size-4" />
                  Discard
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                  onClick={handleSave}
                >
                  <SaveIcon className="size-4" />
                  Save Theme
                </Button>
              </>
            )}

            <Button variant="ghost" onClick={handleClose}>
              <XIcon strokeWidth={2} />
              Close
            </Button>
          </div>

          {/* Library (left) + editor (right) layout */}
          <div
            className="min-h-0 flex-1"
            style={{
              display: "grid",
              gridTemplateColumns: isEditing ? "300px 1fr 340px" : "300px 1fr",
            }}
          >
            <ThemeLibrary />

            {isEditing ? (
              <>
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <ThemeFormatToolbar />
                  <DesignCanvas />
                </div>
                <PropertiesPanel />
              </>
            ) : (
              <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <PaletteIcon className="size-10 opacity-40" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Select a theme to edit
                  </p>
                  <p className="mt-1 text-xs">
                    Pick a theme from the list, or create a new one to get
                    started.
                  </p>
                </div>
              </div>
            )}
          </div>
          {/* Discard confirmation modal */}
          {showDiscardConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading leading-none font-medium">
                    Discard changes?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    All unsaved changes to this theme will be lost. This action
                    cannot be undone.
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDiscardConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleConfirmDiscard}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
