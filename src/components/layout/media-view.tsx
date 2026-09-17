import { TransportBar } from "@/components/controls/transport-bar"
import { MediaGrid } from "@/components/media/media-grid"

export function MediaView() {
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
        <MediaGrid />
      </div>
    </div>
  )
}
