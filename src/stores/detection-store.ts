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

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],

  addDetection: (detection) =>
    set((state) => {
      // Newest on top. Re-detecting a verse moves it back to the top with the
      // latest data. Capped by recency, never by confidence, so a fresh
      // detection is always shown regardless of what scored higher before.
      const rest = state.detections.filter(
        (d) => d.verse_ref !== detection.verse_ref
      )
      return { detections: [detection, ...rest].slice(0, 50) }
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
