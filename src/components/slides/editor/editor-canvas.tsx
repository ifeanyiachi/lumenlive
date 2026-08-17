import { useState, type RefObject } from "react"

import { MinusIcon, PlusIcon, MaximizeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SlideCanvasOverlay } from "@/components/slides/slide-canvas-overlay"

/**
 * Center canvas stage: the 16:9 preview `<canvas>` (rendered by the parent's
 * canvas coordinator), an optional 10×10 alignment grid overlay, the selection
 * overlay, and the zoom controls. Zoom is local UI state (25–300%); the canvas
 * ref and grid visibility are owned by the editor shell.
 */
export function EditorCanvas({
  canvasRef,
  showGrid,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  showGrid: boolean
}) {
  const [zoomLevel, setZoomLevel] = useState(100)

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/30 p-8">
      <div
        className="relative aspect-video shrink-0"
        style={{
          maxHeight: zoomLevel === 100 ? "100%" : "none",
          maxWidth: zoomLevel === 100 ? "100%" : "none",
          width: zoomLevel !== 100 ? `${(zoomLevel / 100) * 80}%` : undefined,
        }}
      >
        <canvas
          ref={canvasRef}
          className="block size-full rounded border border-border shadow-lg"
        />
        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0 rounded"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "10% 10%",
            }}
          />
        )}
        <SlideCanvasOverlay canvasRef={canvasRef} />
      </div>

      {/* Zoom controls */}
      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-md border border-border bg-card/90 px-1 py-0.5 shadow-sm backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          title="Zoom out"
          onClick={() => setZoomLevel((z) => Math.max(25, Math.round(z * 0.9)))}
        >
          <MinusIcon className="size-3" />
        </Button>
        <span className="min-w-[2.5rem] text-center text-[0.6875rem] text-muted-foreground tabular-nums">
          {zoomLevel}%
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          title="Zoom in"
          onClick={() =>
            setZoomLevel((z) => Math.min(300, Math.round(z * 1.1)))
          }
        >
          <PlusIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          title="Fit to view"
          onClick={() => setZoomLevel(100)}
        >
          <MaximizeIcon className="size-3" />
        </Button>
      </div>
    </div>
  )
}
