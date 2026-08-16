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
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import type { SlideThemeCategory, SlideLayoutVariant } from "@/types/slide"
import { cn } from "@/lib/utils"

const CATEGORY_LABELS: Record<SlideThemeCategory, string> = {
  general: "General",
  song: "Song / Lyrics",
  scripture: "Scripture",
}

function gradientCss(bg: import("@/types/slide").SlideBackground): string {
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

export function SlideThemePicker() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<SlideThemeCategory | "all">("all")
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [variant, setVariant] = useState<SlideLayoutVariant>("content-only")

  // Built-ins plus the user's custom slide/song themes (Phase 4 follow-up).
  const customSlideThemes = usePresentationStore((s) => s.customSlideThemes)
  const allThemes = useMemo(
    () => [...BUILTIN_SLIDE_THEMES, ...customSlideThemes],
    [customSlideThemes]
  )

  const filtered =
    category === "all"
      ? allThemes
      : allThemes.filter((t) => t.category === category)

  const selectedTheme = allThemes.find((t) => t.id === selectedThemeId)
  const availableVariants = selectedTheme?.variants.map((v) => v.layout) ?? []

  const handleApplyToSlide = () => {
    if (!selectedThemeId) return
    usePresentationStore.getState().applyThemeToSlide(selectedThemeId, variant)
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
            value={category}
            onValueChange={(v) => setCategory(v as SlideThemeCategory | "all")}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="song">Song / Lyrics</SelectItem>
              <SelectItem value="scripture">Scripture</SelectItem>
            </SelectContent>
          </Select>

          {selectedTheme && availableVariants.length > 0 && (
            <Select
              value={variant}
              onValueChange={(v) => setVariant(v as SlideLayoutVariant)}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableVariants.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v
                      .replace(/-/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="grid grid-cols-3 gap-3 p-1">
            {filtered.map((theme) => {
              const previewVariant = theme.variants[0]
              if (!previewVariant) return null
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
                    style={{
                      background: gradientCss(previewVariant.background),
                    }}
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
                      {CATEGORY_LABELS[theme.category]}
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
