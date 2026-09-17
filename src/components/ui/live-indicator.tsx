import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

function LiveIndicator({
  className,
  active,
  label,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  active: boolean
  label?: string
}) {
  const { t } = useTranslation("ui")
  return (
    <div
      data-slot="live-indicator"
      className={cn(
        "flex items-center gap-1.5 text-[0.625rem] font-medium tracking-wider uppercase",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          active
            ? "animate-pulse bg-live-pulse shadow-[0_0_6px] shadow-live-pulse"
            : "bg-muted-foreground/40"
        )}
      />
      <span className={active ? "text-destructive" : "text-muted-foreground"}>
        {label ?? (active ? t("live.active") : t("live.inactive"))}
      </span>
    </div>
  )
}

export { LiveIndicator }
