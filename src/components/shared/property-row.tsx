import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function PropertyRow({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
