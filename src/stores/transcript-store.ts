import { create } from "zustand"
import type { TranscriptSegment } from "@/types"

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

// Cap retained segments so a long service doesn't grow the array (and every
// subscriber's diff) without bound. Mirrors the recency cap in detection-store.
const MAX_SEGMENTS = 500

interface TranscriptState {
  segments: TranscriptSegment[]
  currentPartial: string
  isTranscribing: boolean
  connectionStatus: ConnectionStatus
  /**
   * Free/trial transcription minutes left on the signed-in account, or `null`
   * when unmetered (unlimited/paid) or unknown (signed out / not yet pulled).
   * Updated infrequently — on session start and each usage report (~1/min).
   */
  remainingMinutes: number | null

  addSegment: (segment: TranscriptSegment) => void
  setPartial: (text: string) => void
  setTranscribing: (transcribing: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setRemainingMinutes: (minutes: number | null) => void
  clearTranscript: () => void
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  currentPartial: "",
  isTranscribing: false,
  connectionStatus: "disconnected",
  remainingMinutes: null,

  addSegment: (segment) =>
    set((state) => {
      const next = [...state.segments, segment]
      return {
        // Keep only the most recent MAX_SEGMENTS (ring buffer via slice).
        segments: next.length > MAX_SEGMENTS ? next.slice(-MAX_SEGMENTS) : next,
        currentPartial: "",
      }
    }),
  setPartial: (currentPartial) => set({ currentPartial }),
  setTranscribing: (isTranscribing) => set({ isTranscribing }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setRemainingMinutes: (remainingMinutes) => set({ remainingMinutes }),
  clearTranscript: () => set({ segments: [], currentPartial: "" }),
}))
