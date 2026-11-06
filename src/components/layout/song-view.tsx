import { TransportBar } from "@/components/controls/transport-bar"
import { SongLibrary } from "@/components/song/song-library"
import { SongDetail } from "@/components/song/song-detail"
import { SongEditor } from "@/components/song/song-editor"

/**
 * The "Songs" top-level view: the shared transport bar over a two-column layout
 * — the song library (left) and the selected song's detail with Lyrics/Slides
 * tabs (right). Mirrors the YouTube tab's sidebar + main shape. The full-screen
 * `SongEditor` still overlays for deep metadata/arrangement edits.
 */
export function SongView() {
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
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: "12px",
          padding: "12px",
          overflow: "hidden",
        }}
      >
        <SongLibrary />
        <SongDetail />
      </div>

      <SongEditor />
    </div>
  )
}
