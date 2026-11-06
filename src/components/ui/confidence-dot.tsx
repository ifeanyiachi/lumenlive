import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

function ConfidenceDot({
  className,
  confidence,
  size = "md",
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  confidence: number
  size?: "sm" | "md"
}) {
  const { t } = useTranslation("ui")
  return (
    <span
      data-slot="confidence-dot"
      role="img"
      aria-label={t("accessibility.detectionConfidence", {
        value: Math.round(confidence * 100),
      })}
      className={cn(
        "inline-block rounded-full",
        size === "sm" ? "size-1.5" : "size-2",
        confidence > 0.8
          ? "bg-confidence-high shadow-dot shadow-confidence-high/40"
          : confidence >= 0.5
            ? "bg-confidence-mid shadow-dot shadow-confidence-mid/40"
            : "bg-confidence-low shadow-dot shadow-confidence-low/40",
        className
      )}
      {...props}
    />
  )
}

export { ConfidenceDot }
