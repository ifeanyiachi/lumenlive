import { useState, useMemo } from "react"
import { useBroadcastStore } from "@/stores"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  PlusIcon,
  HeartIcon,
  MoreHorizontalIcon,
  SearchIcon,
  DownloadIcon,
  UploadIcon,
  CheckCircleIcon,
  PinIcon,
  PinOffIcon,
  EditIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { importTheme, exportTheme } from "@/lib/theme-designer-files"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import type { ThemeCategory } from "@/types/broadcast"

type FilterTab = "all" | "pinned" | "custom" | ThemeCategory

const THUMBNAIL_VERSE: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ text: "Sample Verse" }],
}

function ThemeCard({
  theme,
  isActive,
  isEditing,
  onSelect,
}: {
  theme: BroadcastTheme
  isActive: boolean
  isEditing: boolean
  onSelect: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
        isEditing && "ring-2 ring-primary"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        <CanvasVerse theme={theme} verse={THUMBNAIL_VERSE} className="w-full" />

        {/* Active badge */}
        {isActive && (
          <Badge className="absolute top-1.5 left-1.5 bg-emerald-600 text-[0.5rem] text-white hover:bg-emerald-600">
            Active
          </Badge>
        )}

        {/* Pin icon */}
        {theme.pinned && (
          <div className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-background/80">
            <HeartIcon className="size-3 text-primary" strokeWidth={2} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-center gap-1.5 px-0.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {theme.name}
          </p>
          {isActive && (
            <p className="text-[0.5rem] text-muted-foreground">Default</p>
          )}
        </div>

        {/* Tags */}
        <div className="flex shrink-0 items-center gap-1">
          {theme.builtin && (
            <Badge variant="outline" className="text-[0.5rem]">
              Built-in
            </Badge>
          )}
        </div>

        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Theme options"
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontalIcon className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-50">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                useBroadcastStore.getState().setActiveTheme(theme.id)
              }}
            >
              <CheckCircleIcon className="mr-2 size-3.5" />
              Set as Active
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                useBroadcastStore.getState().togglePinTheme(theme.id)
              }}
            >
              {theme.pinned ? (
                <>
                  <PinOffIcon className="mr-2 size-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <PinIcon className="mr-2 size-3.5" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            {!theme.builtin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    const newName = window.prompt("Rename theme:", theme.name)
                    if (newName?.trim()) {
                      useBroadcastStore
                        .getState()
                        .renameTheme(theme.id, newName.trim())
                    }
                  }}
                >
                  <EditIcon className="mr-2 size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    useBroadcastStore.getState().deleteTheme(theme.id)
                  }}
                >
                  <Trash2Icon className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

const CATEGORY_FILTERS: ThemeCategory[] = ["scripture", "sermon", "overlay"]

export function ThemeLibrary() {
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore(
    (s) => s.outputs.find((o) => o.id === "main")?.themeId ?? ""
  )
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterTab>("all")
  // Holds a pending theme switch while the user confirms discarding unsaved
  // edits. Running it applies the switch (which overwrites the dirty draft).
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null)

  // A switch is only guarded when the current draft has recorded edits — the
  // undo stack is our dirty signal (every mutation pushes a snapshot).
  const guardSwitch = (action: () => void) => {
    const state = useBroadcastStore.getState()
    if (state.draftTheme && state.undoStack.length > 0) {
      setPendingSwitch(() => action)
    } else {
      action()
    }
  }

  const filteredThemes = useMemo(() => {
    let result = themes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (filter === "pinned") result = result.filter((t) => t.pinned)
    else if (filter === "custom") result = result.filter((t) => !t.builtin)
    else if (CATEGORY_FILTERS.includes(filter as ThemeCategory))
      result = result.filter((t) => (t.category ?? "general") === filter)
    return result
  }, [themes, search, filter])

  const builtinThemes = filteredThemes.filter((t) => t.builtin)
  const customThemes = filteredThemes.filter((t) => !t.builtin)

  const handleNewTheme = () => {
    guardSwitch(() => useBroadcastStore.getState().createNewTheme())
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        <span className="text-lg font-semibold text-foreground">Themes</span>
        <Button onClick={handleNewTheme}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-4">
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
        className="shrink-0 px-3 pb-4"
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
        <div className="mt-2 flex flex-wrap gap-1">
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? "all" : cat)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[0.625rem] font-medium transition-colors",
                filter === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {cat === "overlay"
                ? "Overlay"
                : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </Tabs>

      {/* Import / Export */}
      <div className="flex gap-1.5 px-3 pb-3">
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={() => {
            void (async () => {
              try {
                const theme = await importTheme()
                if (theme) {
                  useBroadcastStore.getState().saveTheme(theme)
                  guardSwitch(() =>
                    useBroadcastStore.getState().startEditing(theme.id)
                  )
                }
              } catch (err) {
                console.error("[theme-library] import failed:", err)
                toast.error("Couldn't import theme", {
                  description: String(err),
                })
              }
            })()
          }}
        >
          <UploadIcon className="size-2.5" />
          Import
        </Button>
        <Button
          variant="outline"
          className="flex-1 border-border bg-transparent"
          onClick={() => {
            void (async () => {
              const id = useBroadcastStore.getState().editingThemeId
              const theme = id
                ? useBroadcastStore.getState().themes.find((t) => t.id === id)
                : null
              if (theme) {
                try {
                  await exportTheme(theme)
                  toast.success("Theme exported")
                } catch (err) {
                  console.error("[theme-library] export failed:", err)
                  toast.error("Couldn't export theme", {
                    description: String(err),
                  })
                }
              }
            })()
          }}
        >
          <DownloadIcon className="size-2.5" />
          Export
        </Button>
      </div>

      {/* Theme list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-2 pb-4">
          {/* Built-in section */}
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
                  isEditing={theme.id === editingThemeId}
                  onSelect={() =>
                    guardSwitch(() =>
                      useBroadcastStore.getState().startEditing(theme.id)
                    )
                  }
                />
              ))}
            </>
          )}

          {/* Custom section */}
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
                  isEditing={theme.id === editingThemeId}
                  onSelect={() =>
                    guardSwitch(() =>
                      useBroadcastStore.getState().startEditing(theme.id)
                    )
                  }
                />
              ))}
            </>
          )}

          {filteredThemes.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No themes found
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Unsaved-changes guard when switching away from a dirty draft */}
      {pendingSwitch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-popover p-6 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            <div className="flex flex-col gap-2">
              <h3 className="font-heading leading-none font-medium">
                Discard unsaved changes?
              </h3>
              <p className="text-sm text-muted-foreground">
                This theme has unsaved edits. Switching now will lose them. This
                action cannot be undone.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingSwitch(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  pendingSwitch()
                  setPendingSwitch(null)
                }}
              >
                Discard &amp; Switch
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
