import { TransportBar } from "@/components/controls/transport-bar"
import { ResourceStorePage } from "@/components/store/resource-store-page"

/**
 * The "Store" tab shell: the shared transport bar on top, with the scrollable
 * resource-store page filling the rest. Mirrors the fixed-inset grid used by the
 * other top-level views (media/slide/youtube), but its body scrolls because the
 * catalog can run taller than the viewport.
 */
export function StoreView() {
  return (
    <div
      style={{ position: "fixed", inset: "0px" }}
      className="flex flex-col overflow-hidden bg-background"
    >
      <TransportBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ResourceStorePage />
      </div>
    </div>
  )
}
