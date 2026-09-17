import { TransportBar } from "@/components/controls/transport-bar"
import { PresentationGrid } from "@/components/slides/presentation-grid"

export function SlideView() {
  // The full-screen editor overlay is mounted globally via the transport bar
  // (PresentationEditorHost), so it appears over any view — including the Theme
  // Designer, from which song themes are edited.
  return (
    <div
      style={{
        position: "fixed",
        inset: "0px",
        overflow: "hidden",
      }}
      className="flex flex-col bg-background"
    >
      <TransportBar />

      <div
        className="min-h-0 flex-1 p-3 [&>*]:size-full"
        style={{
          overflow: "hidden",
        }}
      >
        <PresentationGrid />
      </div>
    </div>
  )
}
