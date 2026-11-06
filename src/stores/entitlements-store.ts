import { create } from "zustand"
import { load } from "@tauri-apps/plugin-store"
import * as entitlements from "@/lib/entitlements"
import type { Entitlement, Limits } from "@/lib/entitlements"
import { getMachineId, verifyLicense } from "@/services/licensing-gateway"

/**
 * All capabilities are free at startup, after sign-out, and with legacy tokens.
 * Verified device tokens are retained for authenticated transcription sessions;
 * their historical feature lists and limits never reduce application access.
 */

const LICENSE_FILE = "license.json"

interface EntitlementsState {
  entitlement: Entitlement
  /** Why we're on the current tier: `ok` | `free` | a verify failure reason. */
  reason: string
  /** The raw signed license token, or `null` when unlicensed. */
  licenseToken: string | null
  /** Unix ms of the last successful online re-validation (for the weekly cadence). */
  lastValidatedAt: number | null
  /** This device's machine id, cached after the first lookup. */
  machineId: string | null

  /** Resolve and cache this device's machine id. */
  ensureMachineId: () => Promise<string>
  /**
   * Apply a freshly-obtained token: persist it, verify offline, and set the
   * entitlement. Returns the verify reason. `markValidated` records the online
   * validation time (set when the token came from activate/validate).
   */
  applyToken: (token: string, markValidated?: boolean) => Promise<string>
  /** Restore a previously valid snapshot when a team switch fails locally. */
  restore: (snapshot: EntitlementSnapshot) => Promise<void>
  /** Load the persisted token from disk and verify it offline (startup). */
  hydrate: () => Promise<void>
  /** Drop the license entirely and fall back to Free (sign-out). */
  clear: () => Promise<void>
}

export interface EntitlementSnapshot {
  entitlement: Entitlement
  reason: string
  licenseToken: string | null
  lastValidatedAt: number | null
}

async function persistLicense(
  token: string | null,
  lastValidatedAt: number | null
) {
  try {
    const store = await load(LICENSE_FILE, { autoSave: false })
    if (token) {
      await store.set("token", token)
      await store.set("lastValidatedAt", lastValidatedAt)
    } else {
      await store.delete("token")
      await store.delete("lastValidatedAt")
    }
    await store.save()
  } catch {
    console.warn("[entitlements] failed to persist license")
  }
}

export const useEntitlementsStore = create<EntitlementsState>((set, get) => ({
  entitlement: entitlements.FREE_ENTITLEMENT,
  reason: "free",
  licenseToken: null,
  lastValidatedAt: null,
  machineId: null,

  ensureMachineId: async () => {
    const cached = get().machineId
    if (cached) return cached
    const id = await getMachineId()
    set({ machineId: id })
    return id
  },

  applyToken: async (token, markValidated = false) => {
    const machineId = await get().ensureMachineId()
    const result = await verifyLicense(token, machineId)
    // Only a locally verified token counts as a successful online validation.
    // Invalid responses must remain eligible for another retry rather than
    // suppressing the weekly revalidation loop.
    const lastValidatedAt =
      markValidated && result.valid ? Date.now() : get().lastValidatedAt

    if (result.valid && result.claims) {
      set({
        entitlement: entitlements.FREE_ENTITLEMENT,
        reason: "ok",
        licenseToken: token,
        lastValidatedAt,
      })
      await persistLicense(token, lastValidatedAt)
    } else {
      // A hard-invalid token (bad signature/shape/machine) is worthless — drop
      // it. A merely-lapsed one (expired/trial_ended) is kept so a later online
      // validate can refresh it; we just fall back to Free in the meantime.
      const keep =
        result.reason === "expired" || result.reason === "trial_ended"
      set({
        entitlement: entitlements.FREE_ENTITLEMENT,
        reason: result.reason,
        licenseToken: keep ? token : null,
        lastValidatedAt,
      })
      await persistLicense(keep ? token : null, keep ? lastValidatedAt : null)
    }
    return result.reason
  },

  restore: async (snapshot) => {
    set({ ...snapshot, entitlement: entitlements.FREE_ENTITLEMENT })
    await persistLicense(snapshot.licenseToken, snapshot.lastValidatedAt)
  },

  hydrate: async () => {
    try {
      const store = await load(LICENSE_FILE, { autoSave: false })
      const token = (await store.get<string>("token")) ?? null
      const lastValidatedAt =
        (await store.get<number>("lastValidatedAt")) ?? null
      if (token) {
        set({ lastValidatedAt })
        await get().applyToken(token, false)
      }
    } catch {
      console.warn("[entitlements] failed to hydrate license")
    }
  },

  clear: async () => {
    set({
      entitlement: entitlements.FREE_ENTITLEMENT,
      reason: "free",
      licenseToken: null,
      lastValidatedAt: null,
    })
    await persistLicense(null, null)
  },
}))

/**
 * Imperative gate for event handlers / effects (reads current state without
 * subscribing). In render, prefer {@link useCan} for a narrow subscription.
 */
export function can(key: string): boolean {
  return entitlements.can(useEntitlementsStore.getState().entitlement, key)
}

/** Imperative numeric cap lookup (see {@link can}). */
export function limit(key: keyof Limits): number {
  return entitlements.limit(useEntitlementsStore.getState().entitlement, key)
}

/** Reactive gate: subscribes narrowly to just this feature's grant. */
export function useCan(key: string): boolean {
  return useEntitlementsStore((s) => entitlements.can(s.entitlement, key))
}

/** Reactive numeric cap lookup. */
export function useLimit(key: keyof Limits): number {
  return useEntitlementsStore((s) => entitlements.limit(s.entitlement, key))
}
