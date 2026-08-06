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
  MonitorIcon,
} from "lucide-react"
import { StageLayoutLibrary } from "./stage-layout-library"
import { StageDesignCanvas } from "./stage-design-canvas"
import { StageZoneList } from "./stage-zone-list"
import { StageInspector } from "./stage-inspector"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function StageLayoutDesigner() {
  const isOpen = useBroadcastStore((s) => s.stageDesignerOpen)
  const draft = useBroadcastStore((s) => s.draftStageLayout)
  const editingId = useBroadcastStore((s) => s.editingStageLayoutId)
  const canUndo = useBroadcastStore((s) => s.stageUndoStack.length > 0)
  const canRedo = useBroadcastStore((s) => s.stageRedoStack.length > 0)
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [showDiscard, setShowDiscard] = useState(false)

  const isEditing = draft != null

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const store = useBroadcastStore.getState()
    if (!store.stageDesignerOpen || !store.draftStageLayout) return
    const target = e.target as HTMLElement
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable

    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault()
      store.stageUndo()
      return
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === "y" || (e.key === "z" && e.shiftKey))
    ) {
      e.preventDefault()
      store.stageRedo()
      return
    }
    if (isInput) return

    const sel = store.selectedZone
    if (!sel) return
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      store.removeZone(sel)
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "d") {
      e.preventDefault()
      store.duplicateZone(sel)
      return
    }
    const step = e.shiftKey ? 10 : 1
    if (e.key === "ArrowUp") {
      e.preventDefault()
      store.nudgeZone(0, -step)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      store.nudgeZone(0, step)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      store.nudgeZone(-step, 0)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      store.nudgeZone(step, 0)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsEditingName(false)
  }, [editingId])

  const handleSave = () => {
    useBroadcastStore.getState().saveStageDraft()
    toast.success("Stage layout saved")
  }

  const handleCommitName = () => {
    const trimmed = nameValue.trim()
    if (trimmed && draft && editingId) {
      useBroadcastStore.getState().renameStageLayout(editingId, trimmed)
      useBroadcastStore.getState().updateStageDraft({ name: trimmed })
    }
    setIsEditingName(false)
  }

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) =>
        useBroadcastStore.getState().setStageDesignerOpen(open)
      }
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Stage Layout Designer
          </DialogPrimitive.Title>

          {/* Top bar */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
            <MonitorIcon className="size-5 text-muted-foreground" />
            {isEditing ? (
              isEditingName ? (
                <Input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
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
                    draft && !draft.builtin && "cursor-pointer hover:bg-muted"
                  )}
                  onDoubleClick={
                    draft && !draft.builtin
                      ? () => {
                          setNameValue(draft.name)
                          setIsEditingName(true)
                        }
                      : undefined
                  }
                  title={
                    draft && !draft.builtin
                      ? "Double-click to rename"
                      : undefined
                  }
                >
                  {draft?.name ?? "Stage Layout"}
                </span>
              )
            ) : (
              <span className="text-xl font-semibold text-foreground">
                Stage Layout Designer
              </span>
            )}

            {isEditing && (
              <div className="ml-2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  disabled={!canUndo}
                  onClick={() => useBroadcastStore.getState().stageUndo()}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2Icon className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-8"
                  disabled={!canRedo}
                  onClick={() => useBroadcastStore.getState().stageRedo()}
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
                  onClick={() =>
                    useBroadcastStore.getState().discardStageDraft()
                  }
                  title="Reset changes and stay in editor"
                >
                  <RotateCcwIcon className="size-4" />
                  Reset
                </Button>
                <Button variant="outline" onClick={() => setShowDiscard(true)}>
                  <TrashIcon className="size-4" />
                  Discard
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/80"
                  onClick={handleSave}
                >
                  <SaveIcon className="size-4" />
                  Save Layout
                </Button>
              </>
            )}

            <Button
              variant="ghost"
              onClick={() =>
                useBroadcastStore.getState().setStageDesignerOpen(false)
              }
            >
              <XIcon strokeWidth={2} />
              Close
            </Button>
          </div>

          {/* Library | canvas | zones+inspector */}
          <div
            className="min-h-0 flex-1"
            style={{
              display: "grid",
              gridTemplateColumns: isEditing ? "280px 1fr 320px" : "280px 1fr",
            }}
          >
            <StageLayoutLibrary />
            {isEditing ? (
              <>
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <StageDesignCanvas />
                  <div className="flex h-8 shrink-0 items-center border-t border-border/40 px-3 text-[0.5625rem] text-muted-foreground/70">
                    <span>Output: 1920 × 1080px</span>
                    <span className="mx-2">·</span>
                    <span>Drag to reposition, corners to resize</span>
                    <span className="mx-2">·</span>
                    <span>Arrow keys nudge · Del removes</span>
                  </div>
                </div>
                <div className="flex min-h-0 flex-col overflow-hidden border-l border-border bg-card">
                  <StageZoneList />
                  <div className="min-h-0 flex-1">
                    <StageInspector />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-0 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                <MonitorIcon className="size-10 opacity-40" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Select a stage layout to edit
                  </p>
                  <p className="mt-1 text-xs">
                    Pick a layout from the list, or create a new one to get
                    started.
                  </p>
                </div>
              </div>
            )}
          </div>

          {showDiscard && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
              <div className="w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading leading-none font-medium">
                    Discard changes?
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    All unsaved changes to this layout will be lost.
                  </p>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowDiscard(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setShowDiscard(false)
                      useBroadcastStore.getState().discardStageDraft()
                    }}
                  >
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
