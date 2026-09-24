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
        className="grid min-h-0 min-w-0 flex-1 auto-rows-[minmax(260px,auto)] grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-2 xl:grid-cols-[320px_repeat(3,minmax(0,1fr))] xl:grid-rows-[minmax(0,2fr)_minmax(0,3fr)] xl:overflow-hidden [&>*]:min-h-0"
      >
        <div
          className="min-h-[320px] min-w-0 lg:row-span-2 xl:col-start-1 xl:row-start-1 xl:row-span-2 [&>*]:h-full"
        >
          <SchedulePanel />
        </div>
        <div className="min-h-[260px] min-w-0 xl:col-start-2 xl:row-start-1 [&>*]:h-full">
          <TranscriptPanel />
        </div>
        <div className="min-h-[300px] min-w-0 xl:col-start-3 xl:row-start-1 [&>*]:h-full">
          <PreviewPanel />
        </div>
        <div className="min-h-[320px] min-w-0 lg:col-span-2 xl:col-span-1 xl:col-start-4 xl:row-start-1 [&>*]:h-full">
          <LiveOutputPanel />
        </div>
        <div className="min-h-[300px] min-w-0 lg:col-span-2 xl:col-start-2 xl:row-start-2 xl:col-span-2 [&>*]:h-full">
          <SearchPanel />
        </div>
        <div className="min-h-[300px] min-w-0 lg:col-span-2 xl:col-start-4 xl:row-start-2 xl:col-span-1 [&>*]:h-full">
          <DetectionsPanel />
        </div>
      </div>
    </div>
  )
}
