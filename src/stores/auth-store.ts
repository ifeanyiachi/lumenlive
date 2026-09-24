import { create } from "zustand"
import { load } from "@tauri-apps/plugin-store"

import type {
  DesktopTeam,
  LicensingErrorCode,
} from "@/services/lumenbo-client"

/**
 * Session state for the LumenBO account (betaplan Phase C, step 3).
 *
 * Holds the better-auth bearer token and the signed-in user, persisted to
 * `auth.json` so a launch restores the session without a re-login. The token is
 * only an *authentication* credential — what the user is entitled to lives in
 * the (offline-verified) license token in `entitlements-store`. Default is
 * signed-out; the app runs fully on the Free tier with no account.
 */

const AUTH_FILE = "auth.json"

export interface AuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
}

type AuthStatus = "loading" | "anonymous" | "authenticated"

export type ActivationStatus =
  | "inactive"
  | "activating"
  | "selecting-team"
  | "activated"
  | "failed"

interface AuthState {
  token: string | null
  user: AuthUser | null
  status: AuthStatus
  activationStatus: ActivationStatus
  activationError: string | null
  activationErrorCode: LicensingErrorCode | null
  pendingTeams: DesktopTeam[] | null
  /** Persist a freshly-obtained session (after sign-in). */
  setSession: (token: string, user: AuthUser) => Promise<void>
  /** Track activation separately from the authenticated bearer session. */
  setActivationState: (
    status: ActivationStatus,
    error?: string | null,
    errorCode?: LicensingErrorCode | null
  ) => void
  /** Hold the in-memory team choice step until activation completes. */
  setPendingTeams: (teams: DesktopTeam[]) => void
  /** Clear activation-only state after successful activation or sign-out. */
  clearActivationState: () => void
  /** Sign out: drop the token in memory and on disk. */
  clearSession: () => Promise<void>
  /** Load any persisted session from disk into memory (call once at startup). */
  hydrate: () => Promise<void>
}

async function writeAuth(token: string | null, user: AuthUser | null) {
  try {
    const store = await load(AUTH_FILE, { autoSave: false })
    if (token && user) {
      await store.set("token", token)
      await store.set("user", user)
    } else {
      await store.delete("token")
      await store.delete("user")
    }
    await store.save()
  } catch {
    console.warn("[auth] failed to persist session")
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  status: "loading",
  activationStatus: "inactive",
  activationError: null,
  activationErrorCode: null,
  pendingTeams: null,

  setSession: async (token, user) => {
    set({
      token,
      user,
      status: "authenticated",
      activationStatus: "activating",
      activationError: null,
      activationErrorCode: null,
      pendingTeams: null,
    })
    await writeAuth(token, user)
  },

  setActivationState: (
    activationStatus,
    activationError = null,
    activationErrorCode = null
  ) => set({ activationStatus, activationError, activationErrorCode }),

  setPendingTeams: (pendingTeams) =>
    set({
      activationStatus: "selecting-team",
      activationError: null,
      activationErrorCode: null,
      pendingTeams,
    }),

  clearActivationState: () =>
    set({
      activationStatus: "activated",
      activationError: null,
      activationErrorCode: null,
      pendingTeams: null,
    }),

  clearSession: async () => {
    set({
      token: null,
      user: null,
      status: "anonymous",
      activationStatus: "inactive",
      activationError: null,
      activationErrorCode: null,
      pendingTeams: null,
    })
    await writeAuth(null, null)
  },

  hydrate: async () => {
    try {
      const store = await load(AUTH_FILE, { autoSave: false })
      const token = (await store.get<string>("token")) ?? null
      const user = (await store.get<AuthUser>("user")) ?? null
      if (token && user) {
        set({
          token,
          user,
          status: "authenticated",
          activationStatus: "inactive",
          activationError: null,
          activationErrorCode: null,
          pendingTeams: null,
        })
        return
      }
    } catch {
      console.warn("[auth] failed to load persisted session")
    }
    set({
      status: "anonymous",
      activationStatus: "inactive",
      activationError: null,
      activationErrorCode: null,
      pendingTeams: null,
    })
  },
}))
