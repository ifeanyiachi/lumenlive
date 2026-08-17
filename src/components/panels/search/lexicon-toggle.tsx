import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The He / Gr interlinear toggle shown on a verse row (only when the lexicon is
 * enabled). Hebrew for OT books (`book_number <= 39`), Greek otherwise. Shared by
 * the book- and context-search rows — the book row passes no extra class; the
 * context row nudges it with `ml-auto mr-5` in its header.
 */
export function LexiconToggle({
  bookNumber,
  open,
  onToggle,
  className,
}: {
  bookNumber: number
  open: boolean
  onToggle: () => void
  className?: string
}) {
  const isHebrew = bookNumber <= 39
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "shrink-0 font-mono text-[10px] transition-opacity",
              open
                ? "bg-lime-500/20 text-lime-400"
                : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground",
              className
            )}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          >
            {isHebrew ? "He" : "Gr"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isHebrew ? "Hebrew interlinear" : "Greek interlinear"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
