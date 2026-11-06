import { invoke } from "@tauri-apps/api/core"

/**
 * Detection backend gateway: the Tauri command names and payloads for the Rust
 * verse-detection subsystem live here so the rest of the app never hardcodes
 * them. (Detection results are backend-push events consumed in the transcript
 * panel; this gateway covers the frontend→backend commands only.)
 */

/**
 * Tell the backend which passage the operator currently has staged/live, so
 * semantic detection can bias toward the chapter being preached. Pass `null`
 * for both to clear it when nothing is live.
 *
 * Fire-and-forget: a failed push must never disrupt a live service, so errors
 * are logged and swallowed rather than propagated.
 */
export async function setDetectionContext(
  bookNumber: number | null,
  chapter: number | null
): Promise<void> {
  try {
    await invoke("set_detection_context", { bookNumber, chapter })
  } catch (err) {
    console.warn("[detection] set_detection_context failed:", err)
  }
}
