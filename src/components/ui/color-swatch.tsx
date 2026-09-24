import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { normalizeHex } from "@/lib/color/color"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ColorMenu } from "@/components/ui/color-picker"

/**
 * Drop-in replacement for the native `<input type="color">` swatch.
 *
 * Renders a color swatch button that opens the shared standard/recent palette.
 * The palette also exposes a self-contained custom picker with a Hex field and
 * RGB inputs for colors outside the standard set.
 *
 * `onChange` receives the canonical `#rrggbb` string directly (not an event),
 * so callers pass `(v) => set(v)` in place of `(e) => set(e.target.value)`.
 */
export function ColorSwatch({
  value,
  onChange,
  className,
  disabled,
  title,
  align = "start",
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
  title?: string
  align?: "start" | "center" | "end"
}) {
  const { t } = useTranslation("ui")
  const swatchColor = normalizeHex(value) ?? "#000000"

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        title={title}
        aria-label={title ?? t("accessibility.chooseColor")}
        style={{ backgroundColor: swatchColor }}
        className={cn(
          "cursor-pointer rounded border border-border disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <PopoverContent
        align={align}
        className="w-auto gap-3 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ColorMenu value={swatchColor} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  )
}
