import { invoke } from "@tauri-apps/api/core"

/**
 * HTTP client for the LumenBO backend (betaplan Phase C, step 2).
 *
 * Every request tunnels through the Rust `licensing_request` command rather than
 * `fetch`, so licensing/auth traffic bypasses the webview CSP (the same reason
 * the lyrics and resource-store gateways fetch in Rust). This module owns the
 * base URL, bearer header, and the `/v1` `{ success, data }` envelope; the
 * licensing gateway above it deals only in typed domain calls.
 */

/** Base URL of the LumenBO API. Dev defaults to the local backend. */
const BASE_URL = (
  import.meta.env.VITE_LUMENBO_URL ?? "http://localhost:3016"
).replace(/\/+$/, "")

/**
 * The `Origin` sent on every request. better-auth rejects auth endpoints with a
 * missing/untrusted Origin, and our Rust `reqwest` path sends none by default —
 * so we assert a trusted desktop origin (see LumenBO `trustedOrigins`).
 */
const DESKTOP_ORIGIN = "https://tauri.localhost"

/** Error codes the desktop flow branches on (mirrors LumenBO `ErrorCode`). */
export type LicensingErrorCode =
  | "UNAUTHORIZED"
  | "DEVICE_LIMIT_REACHED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL"
  | "NETWORK"
  | "UNKNOWN"
  | string

/** A failed backend call — carries the envelope code + HTTP status so callers
 *  can distinguish "wrong password" (401) from "device limit" (409). */
export class LicensingError extends Error {
  code: LicensingErrorCode
  status: number
  details?: unknown

  constructor(
    code: LicensingErrorCode,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message)
    this.name = "LicensingError"
    this.code = code
    this.status = status
    this.details = details
  }
}

interface RawResponse {
  status: number
  body: string
  headers: Record<string, string>
}

interface RequestOpts {
  method?: "GET" | "POST"
  token?: string | null
  body?: unknown
}

/** Low-level request: composes the URL and runs it through Rust. */
async function raw(path: string, opts: RequestOpts = {}): Promise<RawResponse> {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
  try {
    return await invoke<RawResponse>("licensing_request", {
      req: {
        url,
        method: opts.method ?? "GET",
        token: opts.token ?? null,
        origin: DESKTOP_ORIGIN,
        body: opts.body ?? null,
      },
    })
  } catch (e) {
    // Transport-level failure (offline, DNS, refused) — never an HTTP status.
    throw new LicensingError("NETWORK", String(e), 0)
  }
}

function parseJson(body: string): unknown {
  try {
    return body ? JSON.parse(body) : null
  } catch {
    return null
  }
}

/**
 * Call a `/v1/*` endpoint and unwrap the success envelope. Throws
 * {@link LicensingError} on `{ success: false }` or a non-2xx status.
 */
export async function v1<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const res = await raw(path, opts)
  const json = parseJson(res.body) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string; details?: unknown } }
    | null

  if (json && "success" in json && json.success === true) {
    return json.data
  }
  if (json && "success" in json && json.success === false) {
    throw new LicensingError(
      json.error.code,
      json.error.message,
      res.status,
      json.error.details,
    )
  }
  throw new LicensingError("UNKNOWN", `Unexpected response (HTTP ${res.status})`, res.status)
}

/** The bearer token better-auth returns on sign-in, read from `set-auth-token`. */
export interface SignInResult {
  token: string
  user: { id: string; email: string; name: string; emailVerified: boolean }
}

/**
 * Sign in via better-auth's `/api/auth/sign-in/email`. The bearer plugin returns
 * the session token in the `set-auth-token` response header (not the body).
 */
export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  const res = await raw("/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password },
  })
  const json = parseJson(res.body) as
    | { user?: { id: string; email: string; name: string; emailVerified: boolean }; message?: string }
    | null

  if (res.status === 401 || res.status === 403) {
    throw new LicensingError("UNAUTHORIZED", json?.message ?? "Invalid email or password", res.status)
  }
  const token = res.headers["set-auth-token"]
  if (res.status < 200 || res.status >= 300 || !token || !json?.user) {
    throw new LicensingError(
      "UNKNOWN",
      json?.message ?? `Sign-in failed (HTTP ${res.status})`,
      res.status,
    )
  }
  return { token, user: json.user }
}
