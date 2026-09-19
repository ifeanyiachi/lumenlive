import { create } from "zustand"
import type { DetectionResult } from "@/types"

// Holds live detection *results* only. Detection *settings* (directVerseDestination,
// confidenceThreshold, cooldownMs, …) live solely in settings-store, which is
// what the live pipeline reads — keep them there to avoid a second, divergent
// source of truth.
interface DetectionState {
  detections: DetectionResult[]
  // Detections that arrived while the panel was paused (operator hovering or
  // scrolling). Merged+deduped among themselves but withheld from `detections`
  // so the visible list never reorders under the cursor. Flushed on `resume`.
  pending: DetectionResult[]
  // Count of buffered verses NOT already visible in `detections` — drives the
  // "N new verses detected" chip. Recomputed on every pending mutation so a
  // re-detection of an already-shown verse doesn't inflate the badge.
  pendingCount: number
  // When true, incoming batches accumulate in `pending` instead of `detections`.
  paused: boolean

  addDetection: (detection: DetectionResult) => void
  addDetections: (detections: DetectionResult[]) => void
  setDetections: (detections: DetectionResult[]) => void
  removeDetection: (verseRef: string) => void
  clearDetections: () => void
  pause: () => void
  resume: () => void
}

// Maximum entries kept in either the visible list or the pending buffer.
const MAX_DETECTIONS = 50

// Decide which detection wins for a given verse_ref when a fresh one collides
// with an existing entry. A direct hit must never be downgraded to semantic by
// a slower semantic pass reporting the same verse; otherwise the newer entry
// wins so re-detections refresh the data and re-rank to the top.
function preferForRef(
  existing: DetectionResult | undefined,
  incoming: DetectionResult
): DetectionResult {
  if (
    existing &&
    existing.source === "direct" &&
    incoming.source === "semantic"
  ) {
    return existing
  }
  return incoming
}

// Merge an incoming batch into an existing recency-ordered list. Dedupes the
// batch by verse_ref (highest confidence wins — batches arrive best-first from
// the backend merger), then dedupes against the existing list via preferForRef
// (direct is never downgraded to semantic), places the surviving batch on top,
// and preserves prior entries not re-detected this round.
//
// Recency-ordered and recency-capped, NOT confidence-sorted: a newly detected
// verse is always shown regardless of what scored higher before. This
// deliberately avoids the starvation bug where the list froze to high-confidence
// direct hits once 50 accumulated. Does NOT cap length — callers slice.
export function mergeBatch(
  existing: DetectionResult[],
  incoming: DetectionResult[]
): DetectionResult[] {
  if (incoming.length === 0) return existing
  const batchMap = new Map<string, DetectionResult>()
  for (const d of incoming) {
    const dup = batchMap.get(d.verse_ref)
    if (!dup || d.confidence > dup.confidence) {
      batchMap.set(d.verse_ref, d)
    }
  }
  const priorByRef = new Map(existing.map((d) => [d.verse_ref, d]))
  for (const [ref, d] of batchMap) {
    batchMap.set(ref, preferForRef(priorByRef.get(ref), d))
  }
  const batch = [...batchMap.values()]
  const refs = new Set(batchMap.keys())
  const prior = existing.filter((d) => !refs.has(d.verse_ref))
  return [...batch, ...prior]
}

// Count buffered verses that aren't already visible — a re-detection of a
// shown verse reorders on flush but isn't a "new verse" for the chip.
function countNew(
  pending: DetectionResult[],
  visible: DetectionResult[]
): number {
  const shown = new Set(visible.map((d) => d.verse_ref))
  return pending.reduce((n, d) => (shown.has(d.verse_ref) ? n : n + 1), 0)
}

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],
  pending: [],
  pendingCount: 0,
  paused: false,

  addDetection: (detection) =>
    set((state) => ({
      detections: mergeBatch(state.detections, [detection]).slice(
        0,
        MAX_DETECTIONS
      ),
    })),
  addDetections: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state
      // While paused, buffer instead of mutating the visible list so the panel
      // stays stable under the operator's cursor. The buffer is merged/deduped
      // the same way the live list is, so the chip counts distinct verses.
      if (state.paused) {
        const pending = mergeBatch(state.pending, incoming).slice(
          0,
          MAX_DETECTIONS
        )
        return { pending, pendingCount: countNew(pending, state.detections) }
      }
      return {
        detections: mergeBatch(state.detections, incoming).slice(
          0,
          MAX_DETECTIONS
        ),
      }
    }),
  setDetections: (detections) => set({ detections }),
  removeDetection: (verseRef) =>
    set((state) => ({
      detections: state.detections.filter((d) => d.verse_ref !== verseRef),
    })),
  clearDetections: () =>
    set({ detections: [], pending: [], pendingCount: 0, paused: false }),
  pause: () => set((state) => (state.paused ? state : { paused: true })),
  resume: () =>
    set((state) => {
      if (!state.paused && state.pending.length === 0) return state
      const detections =
        state.pending.length > 0
          ? mergeBatch(state.detections, state.pending).slice(0, MAX_DETECTIONS)
          : state.detections
      return { detections, pending: [], pendingCount: 0, paused: false }
    }),
}))
