import { useState, useMemo } from "react"
import type { LucideIcon } from "lucide-react"
import {
  PlusIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  BookOpenIcon,
  MusicIcon,
  TimerIcon,
  PresentationIcon,
  LayersIcon,
  MegaphoneIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { THEME_TYPES } from "@/lib/theme/templates"
import type { Theme, ThemeType } from "@/types/theme"
import { ThemeThumbnail } from "@/components/broadcast/theme-thumbnail"

/** Per-type display metadata for the New menu and card badges. */
const TYPE_META: Record<ThemeType, { label: string; icon: LucideIcon }> = {
  scripture: { label: "Scripture", icon: BookOpenIcon },
  song: { label: "Song / Lyrics", icon: MusicIcon },
  countdown: { label: "Countdown", icon: TimerIcon },
  sermon: { label: "Sermon", icon: PresentationIcon },
  overlay: { label: "Overlay", icon: LayersIcon },
  announcement: { label: "Announcement", icon: MegaphoneIcon },
}

type FilterTab = "all" | "pinned" | "custom"

/**
 * The theme library for the type-first model (themeredo.md, Phase 3). Lists every
 * theme (built-ins + customs from `useThemesStore`); **New** offers the six
 * intrinsic types — each opens the editor on a seeded builder. There is no
 * "category" concept: a theme's type is intrinsic and never re-tagged.
 */
export function ThemeLibrary({
  activeThemeId,
  onOpenTheme,
  onNewTheme,
}: {
  activeThemeId: string | null
  onOpenTheme: (theme: Theme) => void
  onNewTheme: (type: ThemeType) => void
}) {
  // Subscribe to the stable `customThemes` slice and derive the merged registry
  // via useMemo — selecting `s.allThemes()` directly returns a fresh array every
  // render, which drives Zustand into an infinite re-render loop.
  const storeCustomThemes = useThemesStore((s) => s.customThemes)
  const allThemes = useMemo(
    () => buildThemeRegistry(storeCustomThemes),
    [storeCustomThemes]
  )
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterTab>("all")

  const filtered = useMemo(() => {
    let result = allThemes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (filter === "pinned") result = result.filter((t) => t.pinned)
    else if (filter === "custom") result = result.filter((t) => !t.builtin)
    return result
  }, [allThemes, search, filter])

  const builtinThemes = filtered.filter((t) => t.builtin)
  const customThemes = filtered.filter((t) => !t.builtin)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">Themes</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <PlusIcon className="size-4" />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>New theme</DropdownMenuLabel>
            {THEME_TYPES.map((type) => {
              const { label, icon: Icon } = TYPE_META[type]
              return (
                <DropdownMenuItem key={type} onClick={() => onNewTheme(type)}>
                  <Icon className="mr-2 size-3.5" />
                  {label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-3">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <Tabs
        value={filter}
        onValueChange={(value) => setFilter(value as FilterTab)}
        className="shrink-0 px-3 pb-3"
      >
        <TabsList className="h-7 w-full">
          <TabsTrigger value="all" className="capitalize">
            all
          </TabsTrigger>
          <TabsTrigger value="pinned" className="capitalize">
            pinned
          </TabsTrigger>
          <TabsTrigger value="custom" className="capitalize">
            custom
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Theme list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-4">
          {builtinThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Built-in
              </p>
              {builtinThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={theme.id === activeThemeId}
                  onSelect={() => onOpenTheme(theme)}
                />
              ))}
            </>
          )}

          {customThemes.length > 0 && (
            <>
              <p className="px-1.5 pt-3 pb-1 text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase">
                Custom
              </p>
              {customThemes.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  isActive={theme.id === activeThemeId}
                  onSelect={() => onOpenTheme(theme)}
                />
              ))}
            </>
          )}

          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No themes found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ThemeCard({
  theme,
  isActive,
  onSelect,
}: {
  theme: Theme
  isActive: boolean
  onSelect: () => void
}) {
  const { label, icon: Icon } = TYPE_META[theme.type]
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-lg border p-1.5 transition-colors",
        isActive
          ? "border-primary bg-primary/5"
          : "border-transparent hover:border-border hover:bg-muted/50"
      )}
    >
      <ThemeThumbnail theme={theme} className="border border-border/50" />
      <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {theme.name}
        </span>
        <span className="shrink-0 text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {/* Pin / delete actions live only on custom themes; built-ins are code. */}
        {!theme.builtin && (
          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              title={theme.pinned ? "Unpin" : "Pin"}
              onClick={(e) => {
                e.stopPropagation()
                useThemesStore.getState().setThemePinned(theme.id, !theme.pinned)
              }}
            >
              <StarIcon
                className={cn(
                  "size-3",
                  theme.pinned && "fill-current text-amber-400"
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 text-muted-foreground hover:text-destructive"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                useThemesStore.getState().deleteTheme(theme.id)
              }}
            >
              <Trash2Icon className="size-3" />
            </Button>
          </div>
        )}
        {theme.pinned && (
          <StarIcon className="size-3 shrink-0 fill-current text-amber-400 group-hover:hidden" />
        )}
      </div>
    </div>
  )
}
