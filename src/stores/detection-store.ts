import { create } from "zustand"
import type { DetectionResult } from "@/types"

// Holds live detection *results* only. Detection *settings* (directAutoDisplay,
// confidenceThreshold, cooldownMs, …) live solely in settings-store, which is
// what the live pipeline reads — keep them there to avoid a second, divergent
// source of truth.
interface DetectionState {
  detections: DetectionResult[]

  addDetection: (detection: DetectionResult) => void
  addDetections: (detections: DetectionResult[]) => void
  setDetections: (detections: DetectionResult[]) => void
  removeDetection: (verseRef: string) => void
  clearDetections: () => void
}

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

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],

  addDetection: (detection) =>
    set((state) => {
      // Newest on top. Re-detecting a verse moves it back to the top with the
      // latest data. Capped by recency, never by confidence, so a fresh
      // detection is always shown regardless of what scored higher before.
      const prior = state.detections.find(
        (d) => d.verse_ref === detection.verse_ref
      )
      const kept = preferForRef(prior, detection)
      const rest = state.detections.filter(
        (d) => d.verse_ref !== detection.verse_ref
      )
      return { detections: [kept, ...rest].slice(0, 50) }
    }),
  addDetections: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state
      // Dedupe within this batch by verse_ref, keeping the highest-confidence
      // instance (the batch arrives best-first from the backend merger).
      const batchMap = new Map<string, DetectionResult>()
      for (const d of incoming) {
        const existing = batchMap.get(d.verse_ref)
        if (!existing || d.confidence > existing.confidence) {
          batchMap.set(d.verse_ref, d)
        }
      }
      // Direct dominates semantic for the same verse. The fast direct worker
      // and the slower semantic worker emit on separate channels, so a spoken
      // reference the direct pass already surfaced (e.g. "John 3:16") arrives
      // again ~300-600ms later as a lower-confidence semantic hit. Without this
      // guard the semantic copy would clobber the direct one below — dropping
      // the "direct" badge and its higher confidence — which is why direct
      // detections appeared to vanish from the panel. Mirror the backend
      // merger's direct-over-semantic precedence here.
      const priorByRef = new Map(
        state.detections.map((d) => [d.verse_ref, d])
      )
      for (const [ref, d] of batchMap) {
        batchMap.set(ref, preferForRef(priorByRef.get(ref), d))
      }
      const batch = [...batchMap.values()]
      // Newest batch on top, then prior detections not re-detected this round.
      // Recency-ordered and recency-capped: a newly detected verse is never
      // starved out by higher-confidence history (which previously froze the
      // list to direct hits once 50 high-confidence entries accumulated).
      const refs = new Set(batchMap.keys())
      const prior = state.detections.filter((d) => !refs.has(d.verse_ref))
      return { detections: [...batch, ...prior].slice(0, 50) }
    }),
  setDetections: (detections) => set({ detections }),
  removeDetection: (verseRef) =>
    set((state) => ({
      detections: state.detections.filter((d) => d.verse_ref !== verseRef),
    })),
  clearDetections: () => set({ detections: [] }),
}))
