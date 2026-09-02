import { invoke } from "@tauri-apps/api/core"
import { v1, signIn as clientSignIn, type SignInResult } from "./lumenbo-client"
import type { Limits, PlanTier } from "@/lib/entitlements"

/**
 * The licensing gateway (betaplan Phase C, step 2): the single typed surface for
 * everything the desktop client does with device identity and license tokens.
 * Rust `invoke`s (machine id, offline verify, os info) and LumenBO `/v1` calls
 * (activate, validate, deactivate) all live here, so stores and UI never touch
 * command names, URLs, or the response envelope.
 */

/** Device metadata from Rust `os_info`, used to name a device on activation. */
export interface OsInfo {
  os: string
  version: string
  arch: string
  hostname: string
}

/** A signed license token + its decoded entitlement, from activate/validate. */
export interface LicenseResult {
  token: string
  tier: PlanTier
  features: string[]
  limits: Limits
  machineId: string
  /** ISO timestamps from the backend. */
  issuedAt: string
  expiresAt: string
  grace: number
}

/** The offline-verify outcome from the Rust `lumenlive-licensing` crate. */
export interface VerifyResult {
  valid: boolean
  reason: string
  claims: {
    sub: string
    tier: PlanTier
    features: string[]
    limits: Limits
    machineId: string
    trialEnd: number | null
    expiresAt: number
    issuedAt: number
    graceDays: number
  } | null
}

// ── Rust-side (offline / host) ────────────────────────────────────────────

/** The stable per-machine id this device's license is node-locked to. */
export function getMachineId(): Promise<string> {
  return invoke<string>("get_machine_id")
}

/** Device metadata for the activation payload and Account screen. */
export function getOsInfo(): Promise<OsInfo> {
  return invoke<OsInfo>("os_info")
}

/**
 * Verify a stored token offline against the embedded public key, node-locked to
 * `machineId`, at the current time. `valid: false` ⇒ the caller applies Free.
 */
export function verifyLicense(
  token: string,
  machineId: string,
): Promise<VerifyResult> {
  return invoke<VerifyResult>("verify_license", { token, machineId })
}

// ── LumenBO `/v1` (online) ────────────────────────────────────────────────

/** Sign in and obtain a bearer token (better-auth). */
export function signIn(email: string, password: string): Promise<SignInResult> {
  return clientSignIn(email, password)
}

export interface ActivateInput {
  token: string
  machineId: string
  machineName?: string
  osInfo?: string
  appVersion?: string
}

/**
 * Register this device and mint a license token. Throws `LicensingError` with
 * code `DEVICE_LIMIT_REACHED` (status 409) when the tier's slots are full.
 */
export function activate(input: ActivateInput): Promise<LicenseResult> {
  const { token, ...body } = input
  return v1<LicenseResult>("/v1/licenses/activate", {
    method: "POST",
    token,
    body,
  })
}

/**
 * Re-validate this device and re-issue a fresh token. Downgrades server-side if
 * the subscription/trial has lapsed — the returned token carries the new tier.
 */
export function validate(
  token: string,
  machineId: string,
): Promise<LicenseResult> {
  return v1<LicenseResult>("/v1/licenses/validate", {
    method: "POST",
    token,
    body: { machineId },
  })
}

/** Free this device's slot (revokes its tokens server-side). */
export function deactivate(
  token: string,
  machineId: string,
): Promise<{ machineId: string }> {
  return v1<{ machineId: string }>("/v1/licenses/deactivate", {
    method: "POST",
    token,
    body: { machineId },
  })
}
