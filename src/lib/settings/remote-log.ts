/**
 * Pure mechanics for the Remote Control command log: building entries (id and
 * timestamp injected for determinism), bounding the list, port parsing, and
 * event-name normalisation. No Tauri, no clock — the section component supplies
 * ids/timestamps and the gateway supplies events.
 */

export interface CommandLogEntry {
  id: number
  timestamp: string
  source: "OSC" | "HTTP"
  command: string
}

/** Newest-first log is capped at this many entries. */
export const MAX_LOG_ENTRIES = 50

/** Build a log entry from an injected id/timestamp and a normalised command. */
export function makeCommandLogEntry(fields: {
  id: number
  timestamp: string
  source: "OSC" | "HTTP"
  command: string
}): CommandLogEntry {
  return { ...fields }
}

/** Prepend an entry and keep only the most recent `MAX_LOG_ENTRIES`. */
export function appendCommandLogEntry(
  prev: CommandLogEntry[],
  entry: CommandLogEntry
): CommandLogEntry[] {
  return [entry, ...prev].slice(0, MAX_LOG_ENTRIES)
}

/** Strip the `remote:` prefix from an event name (e.g. `remote:next` → `next`). */
export function stripRemotePrefix(event: string): string {
  return event.replace("remote:", "")
}

/** Parse a port field, falling back when it is empty or non-numeric. */
export function parsePort(raw: string, fallback: number): number {
  return parseInt(raw) || fallback
}
