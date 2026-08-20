import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PaletteIcon, CheckIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { useThemesStore } from "@/stores/themes"
import { BUILTIN_THEMES } from "@/lib/theme/builtins"
import type { ThemeType } from "@/types/theme"
import type { SlideBackground } from "@/types/slide"
import { cn } from "@/lib/utils"

const TYPE_LABELS: Record<ThemeType, string> = {
  scripture: "Scripture",
  song: "Song / Lyrics",
  countdown: "Countdown",
  sermon: "Sermon",
  overlay: "Overlay",
  announcement: "Announcement",
}

/** A static CSS swatch approximating a theme's background for the grid preview. */
function gradientCss(bg: SlideBackground): string {
  if (bg.type === "solid") return bg.color ?? "#1a1a2e"
  if (bg.type === "gradient" && bg.gradient) {
    const stopsStr = bg.gradient.stops
      .slice()
      .sort((a, b) => a.offset - b.offset)
      .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
      .join(", ")
    return bg.gradient.type === "linear"
      ? `linear-gradient(${bg.gradient.angle ?? 180}deg, ${stopsStr})`
      : `radial-gradient(circle, ${stopsStr})`
  }
  // Animated backgrounds get a representative static swatch from their palette
  // (the live motion only renders on a canvas, not in this CSS preview).
  if (bg.type === "animated" && bg.animated) {
    const { palette, baseColor } = bg.animated
    if (palette.length === 1) return palette[0]
    if (palette.length > 1) {
      const base = baseColor ?? palette[palette.length - 1]
      return `radial-gradient(circle at 30% 30%, ${palette[0]}, ${base})`
    }
  }
  return "#1a1a2e"
}

/**
 * Deck theming (themeredo.md, 3C). Applying a `Theme` **bakes** its background
 * and text typography onto the slide(s) — there is no stored theme reference, so
 * re-applying is how you change the look. Lists every theme from the typed store
 * (built-ins + customs), filterable by type; the variant selector is gone (the
 * type-first model has no per-theme layout variants).
 */
export function SlideThemePicker() {
  const [open, setOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<ThemeType | "all">("all")
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)

  const customThemes = useThemesStore((s) => s.customThemes)
  // Built-in look catalog first, then the user's custom themes.
  const themes = useMemo(
    () => [...BUILTIN_THEMES, ...customThemes],
    [customThemes]
  )

  const filtered =
    typeFilter === "all"
      ? themes
      : themes.filter((t) => t.type === typeFilter)

  const selectedTheme = themes.find((t) => t.id === selectedThemeId)

  const handleApplyToSlide = () => {
    if (!selectedThemeId) return
    usePresentationStore.getState().applyThemeToSlide(selectedThemeId)
  }

  const handleApplyToAll = () => {
    if (!selectedThemeId) return
    usePresentationStore.getState().applyThemeToPresentation(selectedThemeId)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Apply theme">
          <PaletteIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Slide Themes</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as ThemeType | "all")}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(Object.entries(TYPE_LABELS) as [ThemeType, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="grid grid-cols-3 gap-3 p-1">
            {filtered.map((theme) => {
              const isSelected = selectedThemeId === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-border hover:border-muted-foreground/50"
                  )}
                  onClick={() => setSelectedThemeId(theme.id)}
                >
                  <div
                    className="aspect-video w-full"
                    style={{ background: gradientCss(theme.background) }}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <CheckIcon className="size-6 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-xs font-medium">{theme.name}</span>
                    <span className="text-[0.5625rem] text-muted-foreground">
                      {TYPE_LABELS[theme.type]}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>

        {selectedTheme && (
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={handleApplyToSlide}>
              Apply to Current Slide
            </Button>
            <Button size="sm" onClick={handleApplyToAll}>
              Apply to All Slides
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
