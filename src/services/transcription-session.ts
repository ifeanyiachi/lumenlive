import { invoke } from "@tauri-apps/api/core"

import { useTranscriptStore } from "@/stores/transcript-store"
import type { TranscriptionMode } from "@/lib/transcription/types"

const NOT_RUNNING_ERROR = "Transcription is not running"

interface ActiveTranscriptionSession {
  mode: Exclude<TranscriptionMode, "blocked">
  token: string
}

// The provider key is intentionally never stored here. Native Rust receives it
// only for the active provider instance; this record only binds callbacks to
// the session that was authorized to use it.
let activeSession: ActiveTranscriptionSession | null = null

export function beginTranscriptionSession(
  mode: Exclude<TranscriptionMode, "blocked">,
  token: string
): void {
  activeSession = { mode, token }
}

export function getActiveTranscriptionSession():
  | ActiveTranscriptionSession
  | null {
  return activeSession
}

export function clearTranscriptionSession(): void {
  activeSession = null
}

/**
 * Stop native transcription before account/team state changes. The native
 * command is best-effort here: local state must still be cleared when the
 * device is already stopped or the native side is unavailable.
 */
export async function stopAndClearTranscription(): Promise<void> {
  try {
    await invoke("stop_transcription")
  } catch (error) {
    if (String(error) !== NOT_RUNNING_ERROR) {
      console.warn("[transcription] failed to stop native session", error)
    }
  } finally {
    clearTranscriptionSession()
    useTranscriptStore.getState().reset()
  }
}

