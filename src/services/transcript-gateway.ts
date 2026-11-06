import { invoke } from "@tauri-apps/api/core"

/**
 * Gateway for durable transcript recordings. Owns the backend command names for
 * listing the most recent per-session transcript files and exporting one to a
 * location the operator picks — so the Settings UI never hardcodes command
 * strings or touches the save dialog directly. The files themselves are written
 * by the Rust `TranscriptRecorder`; nothing here parses their contents.
 */

/** One transcript recording on disk, as surfaced to the UI. */
export interface TranscriptRecording {
  /** Backend filename, e.g. `transcript-20261019-143000Z.log`. */
  name: string
  /**
   * Epoch milliseconds (UTC) when the session started, parsed from the
   * filename; `null` when the name couldn't be parsed.
   */
  recordedAt: number | null
  /** File size in bytes. */
  sizeBytes: number
}

/** Raw row from `list_recent_transcripts` (camelCase serde). */
interface RawTranscriptInfo {
  name: string
  recordedAt: number | null
  sizeBytes: number
}

/**
 * List the most recent transcript recordings, newest first. Defaults to the
 * latest three (the latest plus the two before it). Returns an empty list when
 * nothing has been recorded yet.
 */
export async function listRecentTranscripts(
  limit = 3
): Promise<TranscriptRecording[]> {
  const rows = await invoke<RawTranscriptInfo[]>("list_recent_transcripts", {
    limit,
  })
  return rows.map((r) => ({
    name: r.name,
    recordedAt: r.recordedAt ?? null,
    sizeBytes: r.sizeBytes,
  }))
}

/**
 * Export one recording: prompt for a save location (pre-filled with the
 * recording's own filename) and copy the file there via the Rust
 * `export_transcript` command. Returns the saved path, or null if the operator
 * cancels or the dialog plugin is unavailable (browser/tests). A copy failure
 * rejects so the caller can report it.
 */
export async function exportTranscript(name: string): Promise<string | null> {
  const dialog = await import("@tauri-apps/plugin-dialog").catch(() => null)
  if (!dialog) return null
  const path = await dialog.save({
    defaultPath: name,
    filters: [{ name: "Transcript log", extensions: ["log"] }],
  })
  if (!path) return null
  await invoke("export_transcript", { name, destPath: path })
  return path
}
