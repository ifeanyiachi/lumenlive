import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatTimecode } from "./shared"

export function TrimPoint({
  label,
  value,
  fallback,
  onSet,
  onClear,
}: {
  label: string
  value?: number
  fallback: string
  onSet: () => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-6 flex-1 gap-1 px-2 text-[0.625rem]"
        onClick={onSet}
        title={`Set ${label} point to current playhead`}
      >
        Set {label}
      </Button>
      <span className="min-w-[2.25rem] shrink-0 text-center text-[0.625rem] text-muted-foreground tabular-nums">
        {value != null ? formatTimecode(value) : fallback}
      </span>
      {value != null && (
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onClear}
          title={`Clear ${label} point`}
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  )
}
