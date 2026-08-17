/**
 * Small runtime-environment probes for the Tauri desktop shell.
 *
 * Kept in `services/` (the I/O boundary) because "are we in Tauri" and "was this
 * a "command not registered yet" error" are facts about the backend runtime, not
 * business logic — the UI reads them to decide whether display/monitor features
 * are available and whether an error is worth alarming the user with.
 */

/**
 * Whether the app is running inside the Tauri desktop runtime. Monitor
 * enumeration and output windows require it; a plain browser has no display API,
 * so callers surface a clear "desktop app required" message instead of a
 * silently-empty control.
 */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * Tauri rejects with "Command <name> not found" when a backend command isn't
 * registered yet (e.g. an in-progress dev build). Those are expected in dev and
 * shouldn't alarm the user; genuine runtime failures should surface.
 */
export function isMissingCommand(error: unknown): boolean {
  return /not found|unknown command/i.test(String(error))
}
