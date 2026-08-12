import { TransportBar } from "@/components/controls/transport-bar"
import { PresentationGrid } from "@/components/slides/presentation-grid"
import { PresentationDetailsPanel } from "@/components/slides/presentation-details-panel"

export function SlideView() {
  // The full-screen editor overlay is mounted globally via the transport bar
  // (PresentationEditorHost), so it appears over any view — including the Theme
  // Designer, from which song themes are edited.
  return (
    <div
      style={{
        position: "fixed",
        inset: "0px",
        display: "grid",
        gridTemplateRows: "56px minmax(0, 1fr)",
        overflow: "hidden",
      }}
      className="bg-background"
    >
      <div className="col-span-2">
        <TransportBar />
      </div>

      <div
        className="col-span-2 min-h-0"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "12px",
          padding: "12px",
          overflow: "hidden",
        }}
      >
        <PresentationGrid />
        <PresentationDetailsPanel />
      </div>
    </div>
  )
}
