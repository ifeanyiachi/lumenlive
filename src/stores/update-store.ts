import { create } from "zustand"
import * as updater from "@/services/updater-gateway"
import type { AvailableUpdate } from "@/lib/updater/version"

/**
 * Orchestrates the app self-update flow. Holds only serializable data — the live
 * `Update` handle lives in the gateway, not here — and delegates every plugin
 * call to updater-gateway. Drives the Store-page banner and the nav-dot
 * indicator; both read `available` + `dismissedVersion` through the pure
 * `shouldNotifyUpdate` predicate so dismissing in one place clears both.
 */

export type UpdateStatus =
  | "idle" // no check yet, or up to date
  | "checking"
  | "available" // a newer build exists
  | "downloading"
  | "ready" // installed; relaunch pending (rarely observed)
  | "error"

interface UpdateState {
  status: UpdateStatus
  available: AvailableUpdate | null
  /** The running build's version (e.g. "1.4.0"); loaded once at boot. */
  currentVersion: string | null
  /**
   * Epoch ms of the last completed check (success *or* up-to-date), or null if
   * no check has finished yet. Lets the Software Update panel tell "never
   * checked" apart from "checked, you're up to date" — both leave status "idle".
   */
  lastCheckedAt: number | null
  /** Version the user dismissed; hydrated from disk at boot. */
  dismissedVersion: string | null
  /** Download progress 0..1 while status === "downloading". */
  progress: number
  check: () => Promise<void>
  install: () => Promise<void>
  dismiss: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  available: null,
  currentVersion: null,
  lastCheckedAt: null,
  dismissedVersion: null,
  progress: 0,

  check: async () => {
    set({ status: "checking" })
    try {
      const info = await updater.checkForUpdate()
      set(
        info
          ? { status: "available", available: info, lastCheckedAt: Date.now() }
          : { status: "idle", available: null, lastCheckedAt: Date.now() }
      )
    } catch (err) {
      console.warn("[updater] check failed", err)
      set({ status: "error" })
    }
  },

  install: async () => {
    if (!get().available) return
    set({ status: "downloading", progress: 0 })
    try {
      // On success the app relaunches, so "ready" is mostly a fallback the UI
      // rarely paints — the process is replaced first.
      await updater.installUpdate((fraction) => set({ progress: fraction }))
      set({ status: "ready" })
    } catch (err) {
      console.warn("[updater] install failed", err)
      set({ status: "error" })
    }
  },

  dismiss: () => {
    const version = get().available?.version
    if (!version) return
    set({ dismissedVersion: version })
    void updater.saveDismissedVersion(version)
  },
}))

/**
 * Hydrate the dismissed version from disk, then check the endpoint once. Called
 * at boot; every failure is swallowed so a broken/offline endpoint can never
 * block startup.
 */
export async function initUpdateNotifier(): Promise<void> {
  try {
    const version = await updater.getCurrentVersion()
    useUpdateStore.setState({ currentVersion: version })
  } catch {
    /* current version is best-effort; the panel falls back to "unknown" */
  }
  try {
    const dismissed = await updater.loadDismissedVersion()
    useUpdateStore.setState({ dismissedVersion: dismissed })
  } catch {
    /* fall through to the check regardless */
  }
  await useUpdateStore.getState().check()
}
