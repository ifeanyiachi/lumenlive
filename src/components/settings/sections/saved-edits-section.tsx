import { ManageEdits } from "@/components/verse-edit/manage-edits"

export function SavedEditsSection() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Manage saved verse formatting edits. These are applied when presenting
        verses from the schedule.
      </p>
      <ManageEdits />
    </div>
  )
}
