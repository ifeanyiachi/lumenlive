import { Button } from "@/components/ui/button"
import {
  LayersIcon,
  ListPlusIcon,
  PencilIcon,
  PlayIcon,
  XIcon,
} from "lucide-react"

/**
 * The floating action bar shown when 2+ verses are multi-selected in the book
 * search list: add each verse to the schedule individually, edit their
 * formatting together, add them as one grouped schedule item, present them
 * straight to the audience, or clear the selection.
 */
export function MultiSelectBar({
  count,
  onAddIndividually,
  onEdit,
  onAddGroupToSchedule,
  onPresent,
  onClear,
}: {
  count: number
  onAddIndividually: () => void
  onEdit: () => void
  onAddGroupToSchedule: () => void
  onPresent: () => void
  onClear: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-sky-500/10 px-3 py-2">
      <LayersIcon className="size-3.5 text-sky-400" />
      <span className="flex-1 text-xs font-medium text-sky-300">
        {count} verses selected
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
        onClick={onAddIndividually}
      >
        <ListPlusIcon className="size-3" />
        Add individually
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
        onClick={onEdit}
      >
        <PencilIcon className="size-3" />
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs hover:bg-sky-500/20 hover:text-sky-300"
        onClick={onAddGroupToSchedule}
      >
        <LayersIcon className="size-3" />
        Add group to Schedule
      </Button>
      <Button
        size="sm"
        className="h-7 gap-1.5 bg-sky-600 text-xs text-white hover:bg-sky-500"
        onClick={onPresent}
      >
        <PlayIcon className="size-3" />
        Present
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Clear selection"
        className="text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  )
}
