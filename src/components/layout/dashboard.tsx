import { TransportBar } from "@/components/controls/transport-bar"
import { TranscriptPanel } from "@/components/panels/transcript-panel"
import { PreviewPanel } from "@/components/panels/preview-panel"
import { LiveOutputPanel } from "@/components/panels/live-output-panel"
import { SearchPanel } from "@/components/panels/search-panel"
import { DetectionsPanel } from "@/components/panels/detections-panel"
import { SchedulePanel } from "@/components/schedule/schedule-panel"
import { MediaView } from "@/components/layout/media-view"
import { SongView } from "@/components/layout/song-view"
import { SlideView } from "@/components/layout/slide-view"
import { YouTubeView } from "@/components/layout/youtube-view"
import { StoreView } from "@/components/layout/store-view"
import { useAppStore } from "@/stores/app-store"

export function Dashboard() {
  const view = useAppStore((s) => s.view)

  if (view === "media") return <MediaView />
  if (view === "song") return <SongView />
  if (view === "slide") return <SlideView />
  if (view === "youtube") return <YouTubeView />
  if (view === "store") return <StoreView />

  return (
    <div
      style={{ position: "fixed", inset: "0px" }}
      className="flex flex-col overflow-hidden bg-background"
    >
      <TransportBar />

      <div
        className="min-h-0 flex-1 *:min-h-0"
        style={{
          padding: "12px",
          display: "grid",
          gap: "12px",
          overflow: "hidden",
          gridTemplateColumns:
            "320px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
          gridTemplateRows: "minmax(0, 2fr) minmax(0, 3fr)",
        }}
      >
        <div
          style={{ gridRow: "1 / 3", gridColumn: "1" }}
          className="min-h-0 [&>*]:h-full"
        >
          <SchedulePanel />
        </div>
        <TranscriptPanel />
        <PreviewPanel />
        <LiveOutputPanel />
        <div style={{ gridColumn: "2 / 4" }} className="min-h-0 [&>*]:h-full">
          <SearchPanel />
        </div>
        <DetectionsPanel />
      </div>
    </div>
  )
}
