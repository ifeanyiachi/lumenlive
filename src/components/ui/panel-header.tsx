import * as React from "react"

import { cn } from "@/lib/utils"

function PanelHeader({
  className,
  title,
  icon,
  children,
  actionsClassName,
  ...props
}: React.ComponentProps<"div"> & {
  title?: string
  icon?: React.ReactNode
  actionsClassName?: string
}) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex min-h-[calc(2.75rem+var(--ui-control-adjust,0rem))] items-center justify-between border-b border-border bg-card px-[calc(0.75rem+var(--ui-space-adjust,0rem))] shadow-inset-highlight",
        className
      )}
      {...props}
    >
      {title && (
        <span className="flex items-center gap-2 text-[0.6875rem] font-medium tracking-wider text-muted-foreground uppercase">
          {icon}
          {title}
        </span>
      )}
      {children && (
        <div className={cn("flex items-center gap-1", actionsClassName)}>
          {children}
        </div>
      )}
    </div>
  )
}

export { PanelHeader }
