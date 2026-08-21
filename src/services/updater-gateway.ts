import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { load } from "@tauri-apps/plugin-store"
import type { AvailableUpdate } from "@/lib/updater/version"

/**
 * The Tauri/IPC boundary for app self-updates. Owns every call into the
 * `updater`, `process`, and `store` plugins so the rest of the app never
 * touches them directly (see remote-control-gateway.ts for the canonical shape).
 *
 * The updater compares the running version against the configured endpoint's
 * `latest.json` and only reports genuinely newer builds. The `Update` handle it
 * hands back is a live, non-serializable class instance, so it is cached here in
 * the module — never in the (serializable) Zustand store — and consumed by
 * installUpdate.
 */

const STORE_FILE = "updates.json"
const DISMISSED_KEY = "dismissedVersion"

/** The live handle from the last successful checkForUpdate, if any. */
let pending: Update | null = null

/**
 * Query the update endpoint. Returns the serializable update info if a newer
 * build is available, or null when up to date. Throws only on transport/config
 * errors (offline, malformed manifest, missing pubkey) — callers should treat a
 * throw as "couldn't check", not "no update".
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check()
  if (!update) {
    pending = null
    return null
  }
  pending = update
  return { version: update.version, notes: update.body ?? "" }
}

/** Download-progress callback: `fraction` runs 0 → 1 over the download. */
export type ProgressHandler = (fraction: number) => void

/**
 * Download and install the update cached by the last checkForUpdate, reporting
 * progress as a 0..1 fraction, then relaunch into the new version. On success
 * the process is replaced by relaunch(), so code after the await rarely runs.
 * Throws if no update is pending.
 */
export async function installUpdate(
  onProgress?: ProgressHandler
): Promise<void> {
  if (!pending) throw new Error("No pending update to install")
  let total = 0
  let received = 0
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0
        break
      case "Progress":
        received += event.data.chunkLength
        onProgress?.(total > 0 ? Math.min(received / total, 1) : 0)
        break
      case "Finished":
        onProgress?.(1)
        break
    }
  })
  await relaunch()
}

/**
 * The version the user last dismissed, persisted across launches. Returns null
 * when nothing was dismissed or the store can't be read (treated as "not
 * dismissed" so a read failure never suppresses a real update notice).
 */
export async function loadDismissedVersion(): Promise<string | null> {
  try {
    const store = await load(STORE_FILE, { autoSave: false })
    return (await store.get<string>(DISMISSED_KEY)) ?? null
  } catch {
    return null
  }
}

/**
 * Persist the dismissed version so the notice stays hidden until a newer build
 * ships. Best-effort: a write failure is logged, not thrown — the worst case is
 * the banner reappears next launch.
 */
export async function saveDismissedVersion(version: string): Promise<void> {
  try {
    const store = await load(STORE_FILE, { autoSave: false })
    await store.set(DISMISSED_KEY, version)
    await store.save()
  } catch {
    console.warn("[updater] Failed to persist dismissed version")
  }
}
