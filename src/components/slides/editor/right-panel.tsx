import { useState } from "react"

import {
  PlusIcon,
  TypeIcon,
  LayersIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ImageIcon,
  BookOpenIcon,
  ArrowUpToLineIcon,
  ArrowDownToLineIcon,
  SquareIcon,
  VideoIcon,
  TimerIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SlideBackgroundProperties } from "@/components/slides/slide-background-properties"
import { usePresentationStore } from "@/stores/presentation-store"
import { cn } from "@/lib/utils"
import type { Slide, SlideElement } from "@/types/slide"

import { LayerList } from "./layer-list"
import { ElementPropertiesRouter } from "./element-properties-router"
import { ThemePropertiesRouter } from "./theme-properties/theme-properties-router"

/**
 * Right-hand tabbed panel: "Layers" (z-order toolbar, add-element menu, the
 * layer list, and the selected element's properties) or "Background" (slide
 * background properties). Tab selection is local UI state.
 */
export function RightPanel({
  activeSlide,
  selectedElementId,
  selectedElement,
}: {
  activeSlide: Slide | null
  selectedElementId: string | null
  selectedElement: SlideElement | null
}) {
  const [rightTab, setRightTab] = useState<"layers" | "background">("layers")
  // When a type-first theme is being authored, the add-menu is curated to that
  // type and — with nothing selected — the panel shows the type-specific theme
  // controls instead of a bare "select an element" hint (themeredo.md, Phase 3).
  const themeType = usePresentationStore(
    (s) => s.typedThemeSession?.identity.type ?? null
  )

  return (
    <div className="flex w-[25%] min-w-[16rem] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex h-11 border-b border-border">
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
            rightTab === "layers"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setRightTab("layers")}
        >
          <LayersIcon className="size-3.5" />
          Layers
        </button>
        <button
          type="button"
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
            rightTab === "background"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setRightTab("background")}
        >
          <ImageIcon className="size-3.5" />
          Background
        </button>
      </div>

      {rightTab === "background" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <SlideBackgroundProperties />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-0.5">
              {selectedElementId && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Bring to front"
                    onClick={() =>
                      usePresentationStore
                        .getState()
                        .moveElementToTop(selectedElementId)
                    }
                  >
                    <ArrowUpToLineIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move up"
                    onClick={() =>
                      usePresentationStore
                        .getState()
                        .moveElementUp(selectedElementId)
                    }
                  >
                    <ChevronUpIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Move down"
                    onClick={() =>
                      usePresentationStore
                        .getState()
                        .moveElementDown(selectedElementId)
                    }
                  >
                    <ChevronDownIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Send to back"
                    onClick={() =>
                      usePresentationStore
                        .getState()
                        .moveElementToBottom(selectedElementId)
                    }
                  >
                    <ArrowDownToLineIcon className="size-3" />
                  </Button>
                  <div className="mx-0.5 h-4 w-px bg-border" />
                </>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" title="Add element">
                  <PlusIcon className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => usePresentationStore.getState().addElement()}
                >
                  <TypeIcon className="mr-2 size-3.5" />
                  Text
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    usePresentationStore.getState().addImageElement()
                  }
                >
                  <ImageIcon className="mr-2 size-3.5" />
                  Image
                </DropdownMenuItem>
                {(themeType === null || themeType === "scripture") && (
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addScriptureElement()
                    }
                  >
                    <BookOpenIcon className="mr-2 size-3.5" />
                    Scripture
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() =>
                    usePresentationStore.getState().addShapeElement()
                  }
                >
                  <SquareIcon className="mr-2 size-3.5" />
                  Shape
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    usePresentationStore.getState().addVideoElement()
                  }
                >
                  <VideoIcon className="mr-2 size-3.5" />
                  Video
                </DropdownMenuItem>
                {(themeType === null || themeType === "countdown") && (
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addTimerElement()
                    }
                  >
                    <TimerIcon className="mr-2 size-3.5" />
                    Timer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <LayerList
            elements={activeSlide?.elements ?? []}
            selectedElementId={selectedElementId}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedElement ? (
              <ElementPropertiesRouter element={selectedElement} />
            ) : themeType && activeSlide ? (
              <ThemePropertiesRouter type={themeType} slide={activeSlide} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  Select an element
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
