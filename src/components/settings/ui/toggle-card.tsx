import type { ReactNode } from "react"

import { Switch } from "@/components/ui/switch"

/**
 * Bordered "title + description + switch" card used across settings sections
 * (Display Mode, Bible, Schedule). Keeps the exact markup those sections shared
 * so the rendered DOM stays identical after the extraction.
 */
export function ToggleCard({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: ReactNode
  description: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
