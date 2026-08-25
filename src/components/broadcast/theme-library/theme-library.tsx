import { useState, useMemo } from "react"
import { toast } from "sonner"
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
  UploadIcon,
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
import { useSettingsStore } from "@/stores"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { THEME_TYPES } from "@/lib/theme/templates"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import { currentDefaultThemeId } from "@/lib/theme/defaults"
import type { Theme, ThemeType } from "@/types/theme"
import { ThemeThumbnail } from "@/components/broadcast/theme-thumbnail"
import { importThemeBundle } from "@/lib/theme-bundle/io"
import { ThemeBundleParseError } from "@/lib/theme-bundle"

/** Per-type display metadata for the New menu and card badges. */
const TYPE_META: Record<ThemeType, { label: string; icon: LucideIcon }> = {
  scripture: { label: "Scripture", icon: BookOpenIcon },
  song: { label: "Song / Lyrics", icon: MusicIcon },
  countdown: { label: "Countdown", icon: TimerIcon },
  sermon: { label: "Sermon", icon: PresentationIcon },
  overlay: { label: "Overlay", icon: LayersIcon },
  announcement: { label: "Announcement", icon: MegaphoneIcon },
}

type FilterTab = "all" | "pinned"

/**
 * The theme library for the type-first model (themeredo.md, Phase 3). Lists every
 * theme from `useThemesStore` as one flat, unsectioned library — there is no
 * built-in/custom demarcation; a theme is just a theme. The current default
 * floats to the very top (whether it is a shipped or a user-authored theme).
 * **New** offers the six intrinsic types — each opens the editor on a seeded
 * builder. There is no "category" concept: a theme's type is intrinsic.
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
  const [typeFilter, setTypeFilter] = useState<ThemeType | "all">("all")

  const filtered = useMemo(() => {
    let result = allThemes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (typeFilter !== "all")
      result = result.filter((t) => t.type === typeFilter)
    if (filter === "pinned") result = result.filter((t) => t.pinned)
    return result
  }, [allThemes, search, filter, typeFilter])

  // The app-wide default scripture theme (resolved through the legacy-id alias
  // so a stored built-in id still matches). Used to float it to the top and to
  // badge its thumbnail.
  const scriptureDefaultThemeId = useSettingsStore(
    (s) => s.scriptureDefaultThemeId
  )
  const defaultThemeId = useMemo(
    () => resolveLegacyThemeId(scriptureDefaultThemeId),
    [scriptureDefaultThemeId]
  )

  // One flat list. Float the current default to the very top — regardless of
  // whether it is a shipped or a user-authored theme — then keep every other
  // theme in registry order (the sort is stable).
  const orderedThemes = useMemo(() => {
    return [...filtered].sort(
      (a, b) =>
        (a.id === defaultThemeId ? 0 : 1) - (b.id === defaultThemeId ? 0 : 1)
    )
  }, [filtered, defaultThemeId])

  const handleImport = async () => {
    try {
      const result = await importThemeBundle()
      if (result) toast.success(`Imported "${result.name}"`)
    } catch (err) {
      toast.error(
        err instanceof ThemeBundleParseError
          ? err.message
          : "Couldn't import that theme file."
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">Themes</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            title="Import theme (.lumtheme)"
            aria-label="Import theme"
            onClick={handleImport}
          >
            <UploadIcon className="size-4" />
          </Button>
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
        </TabsList>
      </Tabs>

      {/* Type filter chips */}
      <div className="flex shrink-0 flex-wrap gap-1 px-3 pb-3">
        <TypeChip
          label="All"
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        />
        {THEME_TYPES.map((type) => (
          <TypeChip
            key={type}
            label={TYPE_META[type].label}
            active={typeFilter === type}
            onClick={() => setTypeFilter(type)}
          />
        ))}
      </div>

      {/* Theme list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pt-2 pb-4">
          {orderedThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              isActive={theme.id === activeThemeId}
              onSelect={() => onOpenTheme(theme)}
            />
          ))}

          {orderedThemes.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No themes found
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

/** A pill toggle in the type-filter row. */
function TypeChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
      )}
    >
      {label}
    </button>
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
  // Scripture and song themes carry an app-wide default; the current default is
  // badged here. Setting the default now lives in the Theme Designer's top bar
  // (not a per-card action). The default id is resolved through the legacy-id
  // alias so a stored built-in id still matches. Other types have no default.
  const scriptureDefaultThemeId = useSettingsStore(
    (s) => s.scriptureDefaultThemeId
  )
  const songSlideDefaults = useSettingsStore((s) => s.songSlideDefaults)
  const isDefault =
    currentDefaultThemeId(theme.type, {
      scriptureDefaultThemeId,
      songSlideDefaults,
    }) === theme.id
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
      <div className="relative">
        <ThemeThumbnail theme={theme} className="border border-border/50" />
        {isDefault && (
          <span className="absolute top-1 left-1 rounded-sm bg-primary px-1.5 py-px text-[0.5625rem] font-semibold tracking-wide text-primary-foreground uppercase shadow-sm">
            Default {theme.type}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {theme.name}
        </span>
        <span className="shrink-0 text-[0.5625rem] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {/* Hover actions: pin/delete for custom themes (built-ins are code).
            "Set as default" lives in the Theme Designer's top bar. */}
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
        {theme.pinned && !isDefault && (
          <StarIcon className="size-3 shrink-0 fill-current text-amber-400 group-hover:hidden" />
        )}
      </div>
    </div>
  )
}
