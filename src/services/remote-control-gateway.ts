import { invoke } from "@tauri-apps/api/core"

/**
 * Gateway for the OSC and HTTP remote-control servers: status polling,
 * start/stop, and subscribing to inbound remote command events. Every Tauri
 * `invoke`/`listen` for remote control lives here, so the Remote Control
 * settings section knows nothing of command names or event strings.
 */

export interface RemoteStatus {
  running: boolean
  port: number | null
  /** HTTP only: access token the remote device must present. */
  token?: string | null
}

export interface HttpStartInfo {
  port: number
  token: string
}

/** The inbound remote command events the log subscribes to. */
const REMOTE_EVENTS = [
  "remote:next",
  "remote:prev",
  "remote:theme",
  "remote:opacity",
  "remote:on_air",
  "remote:show",
  "remote:hide",
  "remote:confidence",
] as const

export function getOscStatus(): Promise<RemoteStatus> {
  return invoke<RemoteStatus>("get_osc_status")
}

export function getHttpStatus(): Promise<RemoteStatus> {
  return invoke<RemoteStatus>("get_http_status")
}

export function stopOsc(): Promise<unknown> {
  return invoke("stop_osc")
}

/** Start the OSC server; resolves with the port it actually bound to. */
export function startOsc(port: number): Promise<number> {
  return invoke<number>("start_osc", { port })
}

export function stopHttp(): Promise<unknown> {
  return invoke("stop_http")
}

/** Start the HTTP server; resolves with the bound port and access token. */
export function startHttp(port: number): Promise<HttpStartInfo> {
  return invoke<HttpStartInfo>("start_http", { port })
}

/**
 * Subscribe to all inbound remote command events. `handler` receives the raw
 * event name (e.g. `remote:next`). Returns a disposer that removes every
 * listener.
 */
export async function onRemoteCommand(
  handler: (event: string) => void
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event")
  const unlisteners: (() => void)[] = []
  const dispose = () => unlisteners.forEach((fn) => fn())
  try {
    for (const event of REMOTE_EVENTS) {
      const unlisten = await listen(event, () => handler(event))
      unlisteners.push(unlisten)
    }
  } catch (err) {
    // A mid-loop failure must not orphan the listeners already registered:
    // tear them down before propagating, so the caller never leaks handles.
    dispose()
    throw err
  }
  return dispose
}
