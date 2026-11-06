import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const emptyStateVariants = cva(
  "flex flex-col items-center justify-center text-center",
  {
    variants: {
      size: {
        sm: "gap-1.5 px-4 py-8",
        md: "gap-2 px-6 py-12",
        lg: "gap-2 px-6 py-16",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

const emptyIconSize = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const

/**
 * Centered empty / no-results placeholder: a muted icon over a title and an
 * optional description and action. Replaces the icon+heading+subtext blocks
 * that were hand-rolled (with drifting padding and opacity) across panels,
 * lists and dialogs.
 *
 * Set `live` for placeholders that appear as the result of an async operation
 * (e.g. "No results found" after a search) so assistive tech announces the
 * change. The icon is decorative and hidden from assistive tech.
 */
function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  size = "md",
  live = false,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof emptyStateVariants> & {
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    /** Announce to assistive tech — use for async "no results" states. */
    live?: boolean
  }) {
  return (
    <div
      data-slot="empty-state"
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className={cn(emptyStateVariants({ size }), className)}
      {...props}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            "text-muted-foreground/40 [&_svg]:size-full",
            emptyIconSize[size ?? "md"]
          )}
        >
          {icon}
        </span>
      )}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="max-w-[36ch] text-xs text-muted-foreground/70">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- cva variants co-located with the component (shadcn convention)
export { EmptyState, emptyStateVariants }
