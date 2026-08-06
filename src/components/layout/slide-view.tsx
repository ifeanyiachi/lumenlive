import { TransportBar } from "@/components/controls/transport-bar"
import { PresentationGrid } from "@/components/slides/presentation-grid"
import { PresentationDetailsPanel } from "@/components/slides/presentation-details-panel"
import { PresentationEditor } from "@/components/slides/presentation-editor"
import { usePresentationStore } from "@/stores/presentation-store"

export function SlideView() {
  const editingId = usePresentationStore((s) => s.editingPresentationId)

  return (
    <>
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

      {editingId && (
        <PresentationEditor
          onClose={() => usePresentationStore.getState().discardDraft()}
        />
      )}
    </>
  )
}
