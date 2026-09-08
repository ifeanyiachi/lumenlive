import { getVersion } from "@tauri-apps/api/app"
import {
  activate,
  deactivate,
  getOsInfo,
  signIn,
  validate,
  type LicenseResult,
} from "@/services/licensing-gateway"
import {
  LicensingError,
  type LicensingErrorCode,
} from "@/services/lumenbo-client"
import type { PlanTier } from "@/lib/entitlements"
import { useAuthStore } from "./auth-store"
import { useEntitlementsStore } from "./entitlements-store"

/**
 * Licensing orchestration (betaplan Phase C, steps 4 & 5): the flows that span
 * the auth session, the device activation, and the offline-verified
 * entitlement. Kept out of the individual stores because each step touches more
 * than one of them plus the gateway.
 *
 *   sign in ─▶ activate this device ─▶ verify the minted token ─▶ set tier
 *   launch  ─▶ hydrate persisted session + token (offline) ─▶ background revalidate
 *   weekly  ─▶ revalidate (picks up downgrades) without a re-login
 */

/** Re-validate at most this often in the background while the app runs. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function appVersion(): Promise<string> {
  try {
    return await getVersion()
  } catch {
    return "0.0.0"
  }
}

/** Build the activation payload from this device's identity. */
async function deviceMeta() {
  const os = await getOsInfo()
  return {
    machineName: os.hostname,
    osInfo: `${os.os} ${os.version} (${os.arch})`,
    appVersion: await appVersion(),
  }
}

/**
 * Sign in, activate this device, and apply the resulting license offline.
 * Throws {@link LicensingError} on failure — the login screen branches on
 * `code`: `UNAUTHORIZED` (bad credentials / unverified email),
 * `DEVICE_LIMIT_REACHED` (409, `details.devices` lists the active devices),
 * or `NETWORK`.
 */
export async function signInAndActivate(
  email: string,
  password: string
): Promise<{ license: LicenseResult }> {
  const { token, user } = await signIn(email, password)

  // Belt-and-braces: block unverified accounts even if the backend didn't.
  if (!user.emailVerified) {
    throw new LicensingError(
      "UNAUTHORIZED",
      "Please verify your email address before signing in. Check your inbox for the verification link.",
      403
    )
  }

  await useAuthStore.getState().setSession(token, user)

  const machineId = await useEntitlementsStore.getState().ensureMachineId()
  const meta = await deviceMeta()
  const license = await activate({ token, machineId, ...meta })
  await useEntitlementsStore.getState().applyToken(license.token, true)

  return { license }
}

/**
 * Sign out: free this device's slot server-side (best-effort — a network
 * failure still signs out locally), then clear the session and drop to Free.
 */
export async function signOut(): Promise<void> {
  const { token, clearSession } = useAuthStore.getState()
  const { machineId, clear } = useEntitlementsStore.getState()
  if (token && machineId) {
    try {
      await deactivate(token, machineId)
    } catch {
      // Offline or already-deactivated — local sign-out proceeds regardless.
    }
  }
  await clearSession()
  await clear()
}

/**
 * The outcome of a {@link revalidate} pass. `ok` carries the tier the device
 * ended up on (already verified offline via `applyToken`) plus the verify
 * `reason`; a failure carries the backend error `code`/`message` so the UI can
 * tell the user *why* nothing changed (auth expired, no seat, offline, …)
 * instead of falsely reporting success.
 */
export type RevalidateResult =
  | { ok: true; tier: PlanTier; reason: string }
  | { ok: false; code: LicensingErrorCode; message: string }

/**
 * Re-validate the current device online and apply the refreshed token. This is
 * where a lapsed subscription downgrades (the server re-issues a Free token) or
 * a freshly-granted one upgrades. Never throws — it returns a
 * {@link RevalidateResult} instead. On any failure the offline-verified
 * entitlement is left in place (the server never lowered us), so background
 * callers can `void` the result and let the next pass retry; the Account screen
 * inspects it to surface the real error.
 */
export async function revalidate(): Promise<RevalidateResult> {
  const { token: authToken } = useAuthStore.getState()
  if (!authToken) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      message:
        "You're signed out on this device. Sign in again to refresh your plan.",
    }
  }

  try {
    const machineId = await useEntitlementsStore.getState().ensureMachineId()
    const license = await validate(authToken, machineId)
    const reason = await useEntitlementsStore
      .getState()
      .applyToken(license.token, true)
    return {
      ok: true,
      tier: useEntitlementsStore.getState().entitlement.tier,
      reason,
    }
  } catch (e) {
    // A failed pass keeps the offline entitlement in place (governed by the
    // token's own trialEnd/grace); we just report why so the caller can act.
    if (e instanceof LicensingError) {
      return { ok: false, code: e.code, message: e.message }
    }
    return { ok: false, code: "UNKNOWN", message: String(e) }
  }
}

/** Whether a background re-validation is due (never validated, or > a week). */
function revalidationDue(): boolean {
  const { licenseToken, lastValidatedAt } = useEntitlementsStore.getState()
  if (!licenseToken) return false
  if (lastValidatedAt == null) return true
  return Date.now() - lastValidatedAt >= WEEK_MS
}

/**
 * Restore the persisted session + license at launch (offline), then kick off a
 * background re-validation if one is due. Call once during boot; swallows its
 * own failures so licensing never blocks startup.
 */
export async function bootstrapLicensing(): Promise<void> {
  try {
    await useAuthStore.getState().hydrate()
    await useEntitlementsStore.getState().hydrate()
    if (revalidationDue()) void revalidate()
  } catch {
    // Any failure just leaves the app on the Free default.
  }
}

/**
 * Start the weekly background re-validation timer. Returns a disposer that
 * clears it. Mount-scoped so a webview reload doesn't stack intervals.
 */
export function startRevalidationLoop(): () => void {
  const id = setInterval(() => {
    if (revalidationDue()) void revalidate()
  }, WEEK_MS)
  return () => clearInterval(id)
}
