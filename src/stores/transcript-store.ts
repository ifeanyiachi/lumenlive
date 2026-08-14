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
  /** True while the cloud provider is unreachable and transcription has failed
   *  over to the bundled on-device (Moonshine) engine. Drives the "offline"
   *  indicator; cleared when the network returns and we fail back to cloud. */
  isOnDeviceFallback: boolean

  addSegment: (segment: TranscriptSegment) => void
  setPartial: (text: string) => void
  setTranscribing: (transcribing: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setOnDeviceFallback: (onDevice: boolean) => void
  clearTranscript: () => void
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  currentPartial: "",
  isTranscribing: false,
  connectionStatus: "disconnected",
  isOnDeviceFallback: false,

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
  setOnDeviceFallback: (isOnDeviceFallback) => set({ isOnDeviceFallback }),
  clearTranscript: () => set({ segments: [], currentPartial: "" }),
}))
