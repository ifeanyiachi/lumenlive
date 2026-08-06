import { TransportBar } from "@/components/controls/transport-bar"
import { MediaGrid } from "@/components/media/media-grid"
import { MediaDetailsPanel } from "@/components/media/media-details-panel"

export function MediaView() {
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
        <MediaGrid />
        <MediaDetailsPanel />
      </div>
    </div>
  )
}
