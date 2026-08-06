import { cn } from "@/lib/utils"

export type AnchorPosition =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

const GRID: (AnchorPosition | null)[][] = [
  ["top-left", "top-center", "top-right"],
  [null, "center", null],
  ["bottom-left", "bottom-center", "bottom-right"],
]

export function AnchorPicker({
  value,
  onChange,
}: {
  value: AnchorPosition
  onChange: (anchor: AnchorPosition) => void
}) {
  return (
    <div className="inline-grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/30 p-1.5">
      {GRID.flat().map((anchor, i) => {
        if (!anchor) {
          return <div key={i} className="size-5" />
        }
        const isActive = value === anchor
        return (
          <button
            key={anchor}
            type="button"
            className={cn(
              "size-5 rounded-sm border transition-colors",
              isActive
                ? "border-primary bg-primary"
                : "border-border bg-background hover:border-primary/50 hover:bg-primary/10"
            )}
            onClick={() => onChange(anchor)}
            title={anchor}
          >
            <span
              className={cn(
                "mx-auto block rounded-full",
                isActive
                  ? "size-2 bg-primary-foreground"
                  : "size-1.5 bg-muted-foreground/50"
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
