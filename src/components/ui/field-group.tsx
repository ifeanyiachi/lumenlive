import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const fieldLabelVariants = cva(
  "font-medium tracking-wider text-muted-foreground uppercase",
  {
    variants: {
      size: {
        sm: "text-[0.625rem]", // property / inspector panels (most common)
        md: "text-xs", // settings dialog
        xs: "text-[10px]", // dense layer lists
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

/**
 * A labelled control group: an uppercase section label stacked over its
 * control. Consolidates the settings/property "label + control" row that was
 * previously copy-pasted across the app.
 *
 * Pass `htmlFor` (matching the control's `id`) to associate the label with its
 * input for screen readers. Use `action` to render a trailing control on the
 * label row (e.g. a value read-out or a reset button).
 */
function FieldGroup({
  className,
  label,
  htmlFor,
  size,
  action,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof fieldLabelVariants> & {
    label: React.ReactNode
    htmlFor?: string
    action?: React.ReactNode
  }) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <div className="flex min-h-4 items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          data-slot="field-label"
          className={fieldLabelVariants({ size })}
        >
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- cva variants co-located with the component (shadcn convention)
export { FieldGroup, fieldLabelVariants }
