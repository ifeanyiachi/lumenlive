import { useBroadcastStore } from "@/stores"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  HeartIcon,
  MoreHorizontalIcon,
  CheckCircleIcon,
  StarIcon,
  PinIcon,
  PinOffIcon,
  EditIcon,
  Trash2Icon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toBroadcastTheme } from "@/lib/theme"
import { SlideThemeThumbnail } from "@/components/broadcast/slide-theme-thumbnail"
import { usePresentationStore } from "@/stores/presentation-store"
import type { VerseRenderData } from "@/types"
import type { UnifiedTheme } from "@/types/theme"
import {
  editSlideTheme,
  duplicateSlideThemeForEdit,
} from "./slide-theme-actions"

const THUMBNAIL_VERSE: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ text: "Sample Verse" }],
}

export function ThemeCard({
  theme,
  isActive,
  isDefault,
  isEditing,
  onSelect,
}: {
  theme: UnifiedTheme
  isActive: boolean
  isDefault: boolean
  isEditing: boolean
  onSelect: () => void
}) {
  // Slide/song themes carry a SlideTheme payload (rendered by the slide renderer,
  // not CanvasVerse) and are edited in the slide editor, not the broadcast canvas.
  // Every song theme is clickable to edit — a built-in opens for editing and
  // forks to a custom copy on save (like the verse designer). The broadcast
  // active/default/pin actions never apply to slide themes.
  const isSlide = theme.kind === "slide"
  const broadcastTheme = isSlide ? null : toBroadcastTheme(theme)
  const isCustomSlide = isSlide && !theme.builtin

  const handleClick = !isSlide ? onSelect : () => editSlideTheme(theme.slide!)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      title={
        isSlide && !isCustomSlide
          ? "Built-in song theme — edit to create your own copy"
          : undefined
      }
      className={cn(
        "group relative flex w-full cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors hover:bg-muted/50",
        isEditing && "ring-2 ring-primary"
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        {broadcastTheme ? (
          <CanvasVerse
            theme={broadcastTheme}
            verse={THUMBNAIL_VERSE}
            className="w-full"
          />
        ) : (
          <SlideThemeThumbnail theme={theme.slide!} className="w-full" />
        )}

        {/* Default / Active badges — broadcast-output concepts only */}
        {!isSlide && (
          <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
            {isDefault && (
              <Badge className="bg-primary text-[0.5rem] text-primary-foreground hover:bg-primary">
                Default
              </Badge>
            )}
            {isActive && (
              <Badge className="bg-emerald-600 text-[0.5rem] text-white hover:bg-emerald-600">
                Active
              </Badge>
            )}
          </div>
        )}

        {/* Pin icon */}
        {!isSlide && theme.pinned && (
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
        </div>

        {/* Tags */}
        <div className="flex shrink-0 items-center gap-1">
          {isSlide && (
            <Badge variant="outline" className="text-[0.5rem]">
              Song
            </Badge>
          )}
          {theme.builtin && (
            <Badge variant="outline" className="text-[0.5rem]">
              Built-in
            </Badge>
          )}
        </div>

        {/* More menu — broadcast themes only (slide themes have no CRUD here) */}
        {!isSlide && (
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
              {!isDefault && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    useBroadcastStore.getState().setDefaultTheme(theme.id)
                  }}
                >
                  <StarIcon className="mr-2 size-3.5" />
                  Set as Default
                </DropdownMenuItem>
              )}
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
        )}

        {/* Slide/song theme menu — edit in the slide editor, not the broadcast one */}
        {isSlide && theme.slide && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Song theme options"
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
                  editSlideTheme(theme.slide!)
                }}
              >
                <EditIcon className="mr-2 size-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateSlideThemeForEdit(theme.slide!)
                }}
              >
                <CheckCircleIcon className="mr-2 size-3.5" />
                Duplicate
              </DropdownMenuItem>
              {isCustomSlide && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      const newName = window.prompt("Rename theme:", theme.name)
                      if (newName?.trim()) {
                        usePresentationStore
                          .getState()
                          .renameCustomSlideTheme(theme.id, newName.trim())
                      }
                    }}
                  >
                    <PinIcon className="mr-2 size-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      usePresentationStore
                        .getState()
                        .deleteCustomSlideTheme(theme.id)
                    }}
                  >
                    <Trash2Icon className="mr-2 size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
