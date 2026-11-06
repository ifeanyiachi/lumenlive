import { create } from "zustand"
import * as updater from "@/services/updater-gateway"
import { isVersionAtLeast, type AvailableUpdate } from "@/lib/updater/version"

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
  | "installing" // download done, verifying + swapping the binary
  | "ready" // installed; relaunch pending (rarely observed)
  | "error"

export type UpdatePolicyStatus =
  "unknown" | "checking" | "allowed" | "blocked" | "error"

interface UpdateState {
  status: UpdateStatus
  policyStatus: UpdatePolicyStatus
  available: AvailableUpdate | null
  /** The running build's version (e.g. "1.4.0"); loaded once at boot. */
  currentVersion: string | null
  /** Minimum version published by the release policy, if any. */
  minimumSupportedVersion: string | null
  /** Last policy failure; a cached policy may still enforce a block offline. */
  policyError: string | null
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
  /**
   * Whether `progress` is a real percentage. False when the update server didn't
   * report a content length, so the UI shows an indeterminate bar instead of a
   * misleading, frozen 0%.
   */
  progressKnown: boolean
  check: () => Promise<void>
  checkPolicy: () => Promise<void>
  install: () => Promise<void>
  dismiss: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: "idle",
  policyStatus: "unknown",
  available: null,
  currentVersion: null,
  minimumSupportedVersion: null,
  policyError: null,
  lastCheckedAt: null,
  dismissedVersion: null,
  progress: 0,
  progressKnown: false,

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

  checkPolicy: async () => {
    set({ policyStatus: "checking", policyError: null })
    try {
      const policy = await updater.fetchUpdatePolicy()
      const currentVersion = get().currentVersion
      const blocked =
        policy.minimumSupportedVersion !== null &&
        (currentVersion === null ||
          !isVersionAtLeast(currentVersion, policy.minimumSupportedVersion))
      await updater.saveMinimumSupportedVersion(policy.minimumSupportedVersion)
      set({
        policyStatus: blocked ? "blocked" : "allowed",
        minimumSupportedVersion: policy.minimumSupportedVersion,
        policyError: null,
      })
    } catch (err) {
      console.warn("[updater] policy check failed", err)
      const cached = await updater.loadMinimumSupportedVersion()
      const currentVersion = get().currentVersion
      const blocked =
        cached !== null &&
        (currentVersion === null || !isVersionAtLeast(currentVersion, cached))
      set({
        // A previously published policy continues to apply offline. If the
        // device has never received a policy, leave normal startup available;
        // the next successful check can activate enforcement.
        policyStatus: blocked ? "blocked" : "allowed",
        minimumSupportedVersion: cached,
        policyError: String(err),
      })
    }
  },

  install: async () => {
    const { available, status, minimumSupportedVersion } = get()
    if (!available) return
    if (
      minimumSupportedVersion !== null &&
      !isVersionAtLeast(available.version, minimumSupportedVersion)
    ) {
      console.warn(
        `[updater] refusing ${available.version}; minimum is ${minimumSupportedVersion}`
      )
      set({ status: "error" })
      return
    }
    // Guard re-entry: a second click while a download/install is already running
    // must not kick off a duplicate downloadAndInstall on the same handle.
    if (status === "downloading" || status === "installing") return
    set({ status: "downloading", progress: 0, progressKnown: false })
    try {
      // On success the app relaunches, so "ready" is mostly a fallback the UI
      // rarely paints — the process is replaced first.
      await updater.installUpdate((u) =>
        set({
          status: u.phase === "installing" ? "installing" : "downloading",
          progress: u.fraction,
          progressKnown: u.known,
        })
      )
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
 * Hydrate update state and resolve both the optional notice and the mandatory
 * policy before the application mounts. A cached policy still applies when the
 * endpoint is offline; without a cached policy, startup remains available so a
 * first-ever network failure cannot trap an installation.
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
  await Promise.all([
    useUpdateStore.getState().check(),
    useUpdateStore.getState().checkPolicy(),
  ])
}
