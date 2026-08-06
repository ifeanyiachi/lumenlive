import { useDetectionStore } from "@/stores"

// Detection is entirely backend-push driven: the Rust STT task runs direct +
// semantic detection and emits `verse_detections`, consumed in transcript-panel.
// There is no frontend-initiated detection, so no `detect_verses` invoke here.
export const detectionActions = {
  clearDetections: () => useDetectionStore.getState().clearDetections(),
  removeDetection: (verseRef: string) =>
    useDetectionStore.getState().removeDetection(verseRef),
}

export function useDetection() {
  const detections = useDetectionStore((s) => s.detections)

  return {
    detections,
    ...detectionActions,
  }
}
