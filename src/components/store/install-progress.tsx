import { memo } from "react"
import { useResourceStore } from "@/stores/resource-store"

/**
 * A slim download-progress bar for one resource. Subscribes to *only* its own
 * entry in the progress map — which updates on every download chunk — so a
 * chunk for one install doesn't re-render every other card (perf rule 3).
 */
function InstallProgressBar({ resourceId }: { resourceId: string }) {
  const fraction = useResourceStore((s) => s.progress[resourceId] ?? 0)
  const pct = Math.round(fraction * 100)
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-150"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default memo(InstallProgressBar)
