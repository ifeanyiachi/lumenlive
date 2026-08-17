import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePresentationStore } from "@/stores/presentation-store"

import { SlideThumb } from "./slide-thumb"

export function SlideStrip({
  onPreviewTransition,
}: {
  onPreviewTransition?: (slideIndex: number) => void
}) {
  const draft = usePresentationStore((s) => s.draftPresentation)
  const activeIndex = usePresentationStore((s) => s.activeSlideIndex)

  if (!draft) return null

  return (
    <div className="flex h-full w-[15%] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-foreground">Slides</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => usePresentationStore.getState().addSlide()}
            title="Add slide"
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {draft.slides.map((slide, index) => (
            <SlideThumb
              key={slide.id}
              slide={slide}
              index={index}
              active={activeIndex === index}
              total={draft.slides.length}
              onPreviewTransition={onPreviewTransition}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
