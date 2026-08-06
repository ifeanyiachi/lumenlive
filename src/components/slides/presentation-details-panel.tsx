import { useRef, useEffect, useMemo } from "react"
import { InfoIcon, PencilIcon, CopyIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { usePresentationStore } from "@/stores/presentation-store"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function PresentationDetailsPanel() {
  const presentations = usePresentationStore((s) => s.presentations)
  const selectedId = usePresentationStore((s) => s.selectedPresentationId)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const presentation = useMemo(
    () => presentations.find((p) => p.id === selectedId) ?? null,
    [presentations, selectedId]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !presentation || presentation.slides.length === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const paint = () => {
      canvas.width = 640
      canvas.height = 360
      renderSlide(ctx, presentation.slides[0], 640, 360, getSlideImageCache())
    }
    paint()
    const slide = presentation.slides[0]
    if (slide.background.type === "image") {
      ensureSlideImages(slide.background.imageUrl, paint)
    }
  }, [presentation])

  if (!presentation) {
    return (
      <div
        data-slot="presentation-details"
        className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
      >
        <PanelHeader title="Details" icon={<InfoIcon className="size-3.5" />} />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">Select a presentation</p>
        </div>
      </div>
    )
  }

  const handleEdit = () => {
    usePresentationStore.getState().startEditing(presentation.id)
  }

  const handleDuplicate = () => {
    usePresentationStore.getState().duplicatePresentation(presentation.id)
  }

  const handleDelete = () => {
    usePresentationStore.getState().deletePresentation(presentation.id)
  }

  return (
    <div
      data-slot="presentation-details"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader title="Details" icon={<InfoIcon className="size-3.5" />} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Preview */}
          <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted">
            <canvas
              ref={canvasRef}
              className="size-full object-contain"
              style={{ aspectRatio: "16/9" }}
            />
          </div>

          {/* Name */}
          <Input
            value={presentation.name}
            onChange={(e) =>
              usePresentationStore
                .getState()
                .renamePresentation(presentation.id, e.target.value)
            }
            className="h-8 text-sm font-medium"
          />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Slides</span>
            <span>{presentation.slides.length}</span>
            <span>Created</span>
            <span>{formatDate(presentation.createdAt)}</span>
            <span>Modified</span>
            <span>{formatDate(presentation.updatedAt)}</span>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleEdit}
            >
              <PencilIcon className="mr-1.5 size-3.5" />
              Edit Presentation
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleDuplicate}
            >
              <CopyIcon className="mr-1.5 size-3.5" />
              Duplicate
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleDelete}
            >
              <TrashIcon className="mr-1.5 size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
