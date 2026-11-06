import { getVersion } from "@tauri-apps/api/app"
import {
  activate,
  deactivate,
  getOsInfo,
  listTeams,
  signIn,
  validate,
  type LicenseResult,
} from "@/services/licensing-gateway"
import {
  LicensingError,
  type LicensingErrorCode,
  type DesktopTeam,
  type SignInResult as AuthSignInResult,
} from "@/services/lumenbo-client"
import type { PlanTier } from "@/lib/entitlements"
import { useAuthStore } from "./auth-store"
import { useEntitlementsStore } from "./entitlements-store"
import { useTeamStore } from "./team-store"
import { useTranscriptStore } from "./transcript-store"
import {
  clearTranscriptionSession,
  stopAndClearTranscription,
} from "@/services/transcription-session"

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

// A validation response contains a complete entitlement token. Keep refreshes
// and team switches in one queue so an older request cannot finish after a
// switch and put the previous team's capabilities back into the store.
let licensingQueue: Promise<void> = Promise.resolve()

function queueLicensingOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = licensingQueue.then(operation, operation)
  licensingQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

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

export interface PendingTeamActivation {
  token: string
  user: AuthSignInResult["user"]
  teams: DesktopTeam[]
}

export type SignInActivationResult =
  | { kind: "activated"; license: LicenseResult }
  | { kind: "select-team"; pending: PendingTeamActivation }

async function activateForTeam(
  token: string,
  organizationId?: string | null,
  availableTeams?: DesktopTeam[]
): Promise<{ license: LicenseResult }> {
  const machineId = await useEntitlementsStore.getState().ensureMachineId()
  const meta = await deviceMeta()
  const license = await activate({
    token,
    machineId,
    organizationId,
    ...meta,
  })

  const verifyReason = await useEntitlementsStore
    .getState()
    .applyToken(license.token, true)
  if (verifyReason !== "ok") {
    throw new LicensingError(
      "LICENSE_INVALID",
      `The server returned a license that could not be verified on this device (${verifyReason}).`,
      502
    )
  }
  if (availableTeams) {
    // Do not replace the current team selection until the new license has
    // passed local signature and machine verification. A failed switch keeps
    // the previous team's valid entitlement and selection intact.
    await useTeamStore.getState().setTeams(availableTeams)
  }
  if (license.organizationId) {
    await useTeamStore.getState().selectTeam(license.organizationId)
  }
  return { license }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): LicensingErrorCode {
  return error instanceof LicensingError ? error.code : "UNKNOWN"
}

/** A backend rejection that definitively ends this device's activation. */
function isTerminalActivationError(error: unknown): boolean {
  return (
    error instanceof LicensingError &&
    (error.code === "NO_SEAT" || error.code === "DEVICE_LIMIT_REACHED")
  )
}

/**
 * Continue the shared post-authentication pipeline from any authentication
 * mechanism. The bearer session is persisted before team discovery or device
 * activation, while the entitlement remains Free until the signed license has
 * been verified and applied.
 */
export async function completeAuthentication(
  authResult: AuthSignInResult
): Promise<SignInActivationResult> {
  const { token, user } = authResult

  // Validate the authenticated identity before retaining it locally.
  if (!user.emailVerified) {
    throw new LicensingError(
      "UNAUTHORIZED",
      "Please verify your email address before signing in. Check your inbox for the verification link.",
      403
    )
  }

  await useAuthStore.getState().setSession(token, user)

  try {
    // A fresh browser authentication must not inherit the previous account's
    // team license while activation is still pending. Preserve the bearer
    // session, but reset entitlement/team context before discovery.
    await stopAndClearTranscription()
    await useEntitlementsStore.getState().clear()
    await useTeamStore.getState().clear()

    const teamList = await listTeams(token)
    await useTeamStore.getState().setTeams(teamList.teams)

    const organizationId =
      teamList.defaultOrganizationId ??
      (teamList.teams.length === 1 ? (teamList.teams[0]?.id ?? null) : null)

    if (organizationId == null && teamList.teams.length > 1) {
      useAuthStore.getState().setPendingTeams(teamList.teams)
      return {
        kind: "select-team",
        pending: { token, user, teams: teamList.teams },
      }
    }

    const result = await activateForTeam(token, organizationId)
    useAuthStore.getState().clearActivationState()
    return { kind: "activated", ...result }
  } catch (error) {
    useAuthStore
      .getState()
      .setActivationState("failed", errorMessage(error), errorCode(error))
    throw error
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
): Promise<SignInActivationResult> {
  return completeAuthentication(await signIn(email, password))
}

/** Complete a sign-in that paused because the account belongs to many teams. */
export async function activatePendingTeam(
  pending: PendingTeamActivation,
  organizationId: string
): Promise<{ license: LicenseResult }> {
  if (!pending.teams.some((team) => team.id === organizationId)) {
    throw new LicensingError("VALIDATION_ERROR", "Select a valid team.", 422)
  }
  try {
    const result = await activateForTeam(pending.token, organizationId)
    useAuthStore.getState().clearActivationState()
    return result
  } catch (error) {
    useAuthStore
      .getState()
      .setActivationState("failed", errorMessage(error), errorCode(error))
    throw error
  }
}

/** Switch the active desktop license to another eligible team. */
export async function switchTeam(
  organizationId: string
): Promise<{ license: LicenseResult }> {
  return queueLicensingOperation(async () => {
    const transcriptionState = useTranscriptStore.getState()
    if (
      transcriptionState.isTranscribing ||
      transcriptionState.connectionStatus === "connecting"
    ) {
      throw new LicensingError(
        "VALIDATION_ERROR",
        "Stop transcription before switching teams.",
        409
      )
    }

    const { token, user } = useAuthStore.getState()
    if (!token || !user) {
      throw new LicensingError("UNAUTHORIZED", "Authentication required.", 401)
    }

    const previousEntitlement = useEntitlementsStore.getState()
    const previousSnapshot = {
      entitlement: previousEntitlement.entitlement,
      reason: previousEntitlement.reason,
      licenseToken: previousEntitlement.licenseToken,
      lastValidatedAt: previousEntitlement.lastValidatedAt,
    }

    try {
      const teamList = await listTeams(token)
      if (!teamList.teams.some((team) => team.id === organizationId)) {
        throw new LicensingError(
          "NO_SEAT",
          "This team is not available on desktop.",
          409
        )
      }

      // Activation is intentionally used here instead of the generic validate
      // endpoint: it resolves the requested organization and mints a fresh token
      // whose features/limits belong to that team. applyToken marks it as an
      // online validation and selectTeam only runs after local verification.
      const result = await activateForTeam(token, organizationId, teamList.teams)
      // A stopped session can still have a final native usage event in flight.
      // Drop its binding and the old team's usage snapshot before the next start.
      clearTranscriptionSession()
      useTranscriptStore.getState().reset()
      return result
    } catch (error) {
      // Local verification of a replacement license can fail after the server
      // accepted activation. Restore the previous verified entitlement so a
      // failed switch cannot accidentally downgrade the currently active team.
      await useEntitlementsStore.getState().restore(previousSnapshot)
      throw error
    }
  })
}

/** Retry activation for an already-authenticated desktop session. */
export async function retryActivation(): Promise<SignInActivationResult> {
  return queueLicensingOperation(async () => {
    const { token, user } = useAuthStore.getState()
    if (!token || !user) {
      throw new LicensingError("UNAUTHORIZED", "Authentication required.", 401)
    }

    useAuthStore.getState().setActivationState("activating")

    try {
      const teamList = await listTeams(token)
      await useTeamStore.getState().setTeams(teamList.teams)
      const selected = useTeamStore.getState().selectedOrganizationId
      const organizationId =
        (selected && teamList.teams.some((team) => team.id === selected)
          ? selected
          : teamList.defaultOrganizationId) ??
        (teamList.teams.length === 1 ? (teamList.teams[0]?.id ?? null) : null)

      if (organizationId == null && teamList.teams.length > 1) {
        useAuthStore.getState().setPendingTeams(teamList.teams)
        return {
          kind: "select-team",
          pending: { token, user, teams: teamList.teams },
        }
      }

      const result = await activateForTeam(token, organizationId)
      useAuthStore.getState().clearActivationState()
      return { kind: "activated", ...result }
    } catch (error) {
      useAuthStore
        .getState()
        .setActivationState("failed", errorMessage(error), errorCode(error))
      throw error
    }
  })
}

/**
 * Sign out: free this device's slot server-side (best-effort — a network
 * failure still signs out locally), then clear the session and drop to Free.
 */
export async function signOut(): Promise<void> {
  // Stop native capture before clearing the bearer token. This prevents the
  // provider from continuing with a team key after the account is signed out.
  await stopAndClearTranscription()

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
  await useTeamStore.getState().clear()
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
async function revalidateNow(): Promise<RevalidateResult> {
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
    const license = await validate(
      authToken,
      machineId,
      useEntitlementsStore.getState().licenseToken
    )
    const reason = await useEntitlementsStore
      .getState()
      .applyToken(license.token, true)
    if (reason !== "ok") {
      useAuthStore
        .getState()
        .setActivationState(
          "failed",
          "The refreshed license could not be verified on this device.",
          "LICENSE_INVALID"
        )
      return {
        ok: false,
        code: "LICENSE_INVALID",
        message: `The refreshed license could not be verified (${reason}).`,
      }
    }

    useAuthStore.getState().setActivationState("activated")
    if (license.organizationId) {
      try {
        const teamList = await listTeams(authToken)
        await useTeamStore.getState().setTeams(teamList.teams)
        await useTeamStore.getState().selectTeam(license.organizationId)
      } catch {
        // A temporary team-list failure must not discard a freshly verified
        // license or replace the last known team context.
      }
    }
    return {
      ok: true,
      tier: useEntitlementsStore.getState().entitlement.tier,
      reason,
    }
  } catch (e) {
    // A failed pass keeps the offline entitlement in place (governed by the
    // token's own trialEnd/grace); we just report why so the caller can act.
    if (e instanceof LicensingError) {
      if (e.code === "UNAUTHORIZED") {
        await useTeamStore.getState().clear()
        useAuthStore
          .getState()
          .setActivationState("failed", e.message, e.code)
      } else if (isTerminalActivationError(e)) {
        await useEntitlementsStore.getState().clear()
        await useTeamStore.getState().clear()
        useAuthStore
          .getState()
          .setActivationState("failed", e.message, e.code)
      }
      return { ok: false, code: e.code, message: e.message }
    }
    return { ok: false, code: "UNKNOWN", message: String(e) }
  }
}

export function revalidate(): Promise<RevalidateResult> {
  return queueLicensingOperation(revalidateNow)
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
    await useTeamStore.getState().hydrate()
    if (
      useAuthStore.getState().status === "authenticated" &&
      useEntitlementsStore.getState().reason === "ok" &&
      useEntitlementsStore.getState().licenseToken
    ) {
      // A locally verified license proves that the previously activated device
      // can resume offline. Keep auth and activation distinct, but restore the
      // activated state so transcription can request a fresh server key once
      // the network is available.
      useAuthStore.getState().setActivationState("activated")
    }
    const authToken = useAuthStore.getState().token
    if (authToken) {
      try {
        const teamList = await listTeams(authToken)
        await useTeamStore.getState().setTeams(teamList.teams)
      } catch (error) {
        if (error instanceof LicensingError && error.code === "UNAUTHORIZED") {
          await useTeamStore.getState().clear()
          useAuthStore
            .getState()
            .setActivationState("failed", error.message, error.code)
        } else if (isTerminalActivationError(error)) {
          await useEntitlementsStore.getState().clear()
          await useTeamStore.getState().clear()
          useAuthStore
            .getState()
            .setActivationState(
              "failed",
              errorMessage(error),
              errorCode(error)
            )
        }
        // Network/service failures keep the last selected team and locally
        // verified license for offline launch.
      }
    }
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
