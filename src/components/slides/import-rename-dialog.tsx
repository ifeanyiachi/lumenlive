import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Shown when an imported deck's name collides with one already in the library
 * (deck names must be unique). Purely a collector: the caller supplies a
 * suggested unique `initialName` and an `isNameTaken` predicate, and this dialog
 * returns the chosen name on confirm. It computes no import logic itself.
 *
 * Confirm is blocked while the name is empty or still taken, so the import
 * cannot proceed under a duplicate name.
 */
export function ImportRenameDialog({
  open,
  initialName,
  isNameTaken,
  onConfirm,
  onCancel,
}: {
  open: boolean
  initialName: string
  isNameTaken: (name: string) => boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  // Re-seed the field each time a new import opens the dialog. Render-time reset
  // (not an effect) — matches PptxFontReconcileDialog and avoids cascading
  // renders / the set-state-in-effect lint rule.
  const [name, setName] = useState(initialName)
  const [seed, setSeed] = useState(initialName)
  if (seed !== initialName) {
    setSeed(initialName)
    setName(initialName)
  }

  const trimmed = name.trim()
  const taken = trimmed.length > 0 && isNameTaken(trimmed)
  const canConfirm = trimmed.length > 0 && !taken

  const confirm = () => {
    if (canConfirm) onConfirm(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Name already in use</DialogTitle>
          <DialogDescription>
            A presentation with this name already exists. Enter a different name
            to finish importing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                confirm()
              }
            }}
            aria-invalid={taken}
            placeholder="Presentation name"
          />
          {taken && (
            <span className="text-xs text-destructive">
              That name is already taken.
            </span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!canConfirm}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
