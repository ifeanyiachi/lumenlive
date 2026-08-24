import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ChevronDownIcon,
  LayersIcon,
  ListPlusIcon,
  PencilIcon,
  PlayIcon,
  XIcon,
} from "lucide-react"

/**
 * The floating action bar shown when 2+ verses are multi-selected in the book
 * search list:
 * - **Add to Schedule** — the whole selection as one combined block item.
 * - **Edit** — format the selected verses together.
 * - **Add as Group** — a collection item that expands into a dropdown deck
 *   (one slide per verse); its caret menu also offers **Add as separate items**
 *   (one independent row per verse).
 * - **Present** — send the block straight to the audience.
 * - clear.
 */
export function MultiSelectBar({
  count,
  onAddToSchedule,
  onEdit,
  onAddAsGroup,
  onAddSeparately,
  onPresent,
  onClear,
}: {
  count: number
  onAddToSchedule: () => void
  onEdit: () => void
  onAddAsGroup: () => void
  onAddSeparately: () => void
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
        onClick={onAddToSchedule}
      >
        <ListPlusIcon className="size-3" />
        Add to Schedule
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
      {/* Split button: primary click adds the collection; the caret opens the
          "separate items" alternative so both live in one compact control. */}
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 rounded-r-none text-xs hover:bg-sky-500/20 hover:text-sky-300"
          onClick={onAddAsGroup}
        >
          <LayersIcon className="size-3" />
          Add as Group
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="More add options"
              className="h-7 w-6 rounded-l-none border-l border-sky-500/20 hover:bg-sky-500/20 hover:text-sky-300"
            >
              <ChevronDownIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddSeparately}>
              <ListPlusIcon className="size-3.5" />
              Add as separate items
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
