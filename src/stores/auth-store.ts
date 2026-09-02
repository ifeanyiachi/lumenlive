import { create } from "zustand"
import { load } from "@tauri-apps/plugin-store"

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

interface AuthState {
  token: string | null
  user: AuthUser | null
  status: AuthStatus
  /** Persist a freshly-obtained session (after sign-in). */
  setSession: (token: string, user: AuthUser) => Promise<void>
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

  setSession: async (token, user) => {
    set({ token, user, status: "authenticated" })
    await writeAuth(token, user)
  },

  clearSession: async () => {
    set({ token: null, user: null, status: "anonymous" })
    await writeAuth(null, null)
  },

  hydrate: async () => {
    try {
      const store = await load(AUTH_FILE, { autoSave: false })
      const token = (await store.get<string>("token")) ?? null
      const user = (await store.get<AuthUser>("user")) ?? null
      if (token && user) {
        set({ token, user, status: "authenticated" })
        return
      }
    } catch {
      console.warn("[auth] failed to load persisted session")
    }
    set({ status: "anonymous" })
  },
}))
