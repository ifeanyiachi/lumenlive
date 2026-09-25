import { appUrl } from "@/lib/app-urls"
import {
  exchangeDesktopAuthorizationCode,
  type DesktopAuthExchangeInput,
} from "@/services/licensing-gateway"
import type { SignInResult } from "@/services/lumenbo-client"
import { openExternalUrl } from "./external-link-gateway"

export const DESKTOP_AUTH_REDIRECT_URI = "lumenlive://auth/callback"
// Start at the server-side authorization endpoint, not /login directly. The
// endpoint creates the durable desktop_request that the web app carries
// through the browser login. Opening /login with the OAuth parameters inline
// lets the normal authenticated redirect win and drops the desktop handoff at
// /account before the callback can be issued.
const DESKTOP_AUTHORIZE_URL = appUrl("/desktop/authorize")
const TRANSACTION_TTL_MS = 10 * 60 * 1000

export type DesktopAuthStatus =
  "idle" | "pending" | "completed" | "cancelled" | "timed-out" | "failed"

export type DesktopAuthErrorCode =
  | "ALREADY_PENDING"
  | "BROWSER_OPEN_FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "MALFORMED_CALLBACK"
  | "NETWORK"
  | "NO_ACTIVE_TRANSACTION"
  | "STATE_MISMATCH"
  | "OFFLINE"
  | "EXCHANGE_FAILED"

export interface DesktopAuthError {
  code: DesktopAuthErrorCode
  message: string
}

export interface DesktopAuthSnapshot {
  status: DesktopAuthStatus
  pendingAction: string | null
  expiresAt: number | null
  result: SignInResult | null
  error: DesktopAuthError | null
}

interface LoginTransaction {
  state: string
  codeVerifier: string
  redirectUri: string
  expiresAt: number
  pendingAction: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | null = null
let activeTransaction: LoginTransaction | null = null
let loginStarting = false
let snapshot: DesktopAuthSnapshot = {
  status: "idle",
  pendingAction: null,
  expiresAt: null,
  result: null,
  error: null,
}

function publish(next: DesktopAuthSnapshot) {
  snapshot = next
  for (const listener of listeners) listener()
}

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

/**
 * The pending login lives in module memory, which a webview reload wipes — a
 * routine event under `tauri dev` (any frontend edit hot-reloads the webview)
 * and unavoidable on a cold launch when the deep link starts the app fresh.
 * Mirroring the transaction to `localStorage` lets a reloaded or freshly booted
 * webview still finish the callback. The PKCE verifier stays on-device, and the
 * entry is removed the instant the transaction is consumed, so an authorization
 * code is never exchangeable twice. Storage is best-effort: a webview without it
 * (or the Node test runtime) transparently falls back to in-memory-only.
 */
const TRANSACTION_STORAGE_KEY = "lumenlive.desktop-auth.transaction"

function persistTransaction(transaction: LoginTransaction) {
  try {
    globalThis.localStorage?.setItem(
      TRANSACTION_STORAGE_KEY,
      JSON.stringify(transaction)
    )
  } catch {
    // Best-effort: fall back to in-memory-only when storage is unavailable.
  }
}

function clearPersistedTransaction() {
  try {
    globalThis.localStorage?.removeItem(TRANSACTION_STORAGE_KEY)
  } catch {
    // Ignore: nothing to clean up when storage is unavailable.
  }
}

function readPersistedTransaction(): LoginTransaction | null {
  let raw: string | null
  try {
    raw = globalThis.localStorage?.getItem(TRANSACTION_STORAGE_KEY) ?? null
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LoginTransaction>
    if (
      typeof parsed.state === "string" &&
      typeof parsed.codeVerifier === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.expiresAt === "number"
    ) {
      return {
        state: parsed.state,
        codeVerifier: parsed.codeVerifier,
        redirectUri: parsed.redirectUri,
        expiresAt: parsed.expiresAt,
        pendingAction:
          typeof parsed.pendingAction === "string"
            ? parsed.pendingAction
            : null,
      }
    }
  } catch {
    // Corrupt entry — drop it below.
  }
  clearPersistedTransaction()
  return null
}

function clearTransaction() {
  clearTimer()
  activeTransaction = null
  clearPersistedTransaction()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  globalThis.crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

async function createPkcePair(): Promise<{
  verifier: string
  challenge: string
}> {
  const verifier = randomToken(32)
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  )
  return {
    verifier,
    challenge: toBase64Url(new Uint8Array(digest)),
  }
}

function normalizePendingAction(pendingAction?: string | null): string | null {
  const value = pendingAction?.trim() ?? ""
  return value ? value.slice(0, 256) : null
}

function transactionError(
  code: DesktopAuthErrorCode,
  message: string
): DesktopAuthError {
  return { code, message }
}

function setFailed(error: DesktopAuthError) {
  publish({
    status: "failed",
    pendingAction: snapshot.pendingAction,
    expiresAt: null,
    result: null,
    error,
  })
}

function setPendingError(error: DesktopAuthError) {
  if (!activeTransaction) {
    setFailed(error)
    return
  }
  publish({
    ...snapshot,
    status: "pending",
    expiresAt: activeTransaction.expiresAt,
    error,
  })
}

function timeoutTransaction() {
  if (!activeTransaction) return
  const pendingAction = activeTransaction.pendingAction
  clearTransaction()
  publish({
    status: "timed-out",
    pendingAction,
    expiresAt: null,
    result: null,
    error: transactionError(
      "EXPIRED",
      "The browser sign-in window expired. Start sign-in again."
    ),
  })
}

/**
 * Build the browser handoff URL from a transaction. Only public transaction
 * values go into the URL; the PKCE verifier remains in memory in the desktop.
 */
export function buildDesktopLoginUrl(transaction: {
  state: string
  codeChallenge: string
  redirectUri?: string
  pendingAction?: string | null
}): string {
  const url = new URL(DESKTOP_AUTHORIZE_URL)
  url.searchParams.set("desktop", "1")
  url.searchParams.set(
    "redirect_uri",
    transaction.redirectUri ?? DESKTOP_AUTH_REDIRECT_URI
  )
  url.searchParams.set("state", transaction.state)
  url.searchParams.set("code_challenge", transaction.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  const pendingAction = normalizePendingAction(transaction.pendingAction)
  if (pendingAction) url.searchParams.set("pending_action", pendingAction)
  return url.toString()
}

/** Start one browser login transaction and open the system browser. */
export async function startDesktopLogin(
  pendingAction?: string | null
): Promise<DesktopAuthSnapshot> {
  if (activeTransaction || loginStarting) {
    const error = transactionError(
      "ALREADY_PENDING",
      "A browser sign-in is already in progress."
    )
    throw error
  }

  loginStarting = true
  try {
    const { verifier, challenge } = await createPkcePair()
    const transaction: LoginTransaction = {
      state: randomToken(32),
      codeVerifier: verifier,
      redirectUri: DESKTOP_AUTH_REDIRECT_URI,
      expiresAt: Date.now() + TRANSACTION_TTL_MS,
      pendingAction: normalizePendingAction(pendingAction),
    }
    activeTransaction = transaction
    persistTransaction(transaction)
    publish({
      status: "pending",
      pendingAction: transaction.pendingAction,
      expiresAt: transaction.expiresAt,
      result: null,
      error: null,
    })
    timer = setTimeout(timeoutTransaction, TRANSACTION_TTL_MS)

    const loginUrl = buildDesktopLoginUrl({
      state: transaction.state,
      codeChallenge: challenge,
      redirectUri: transaction.redirectUri,
      pendingAction: transaction.pendingAction,
    })
    const opened = await openExternalUrl(loginUrl)
    if (opened === false) {
      throw transactionError(
        "BROWSER_OPEN_FAILED",
        "LumenLive could not open the browser sign-in page."
      )
    }
  } catch (error) {
    clearTransaction()
    const authError =
      typeof error === "object" && error !== null && "code" in error
        ? (error as DesktopAuthError)
        : transactionError("BROWSER_OPEN_FAILED", errorMessage(error))
    setFailed(authError)
    throw authError
  } finally {
    loginStarting = false
  }

  return getDesktopAuthSnapshot()
}

/** Cancel the active browser login and invalidate its state/verifier. */
export function cancelDesktopLogin(): void {
  if (!activeTransaction) return
  const pendingAction = activeTransaction.pendingAction
  clearTransaction()
  publish({
    status: "cancelled",
    pendingAction,
    expiresAt: null,
    result: null,
    error: transactionError("CANCELLED", "Browser sign-in was cancelled."),
  })
}

function callbackUrl(value: string | URL): URL {
  let url: URL
  try {
    url = typeof value === "string" ? new URL(value) : value
  } catch {
    throw transactionError(
      "MALFORMED_CALLBACK",
      "The sign-in callback is malformed."
    )
  }

  if (
    url.protocol !== "lumenlive:" ||
    url.hostname !== "auth" ||
    url.pathname !== "/callback"
  ) {
    throw transactionError(
      "MALFORMED_CALLBACK",
      "The sign-in callback is not for LumenLive."
    )
  }

  if (url.hash) {
    throw transactionError(
      "MALFORMED_CALLBACK",
      "The sign-in callback must not contain a fragment."
    )
  }
  const allowedParams = new Set([
    "code",
    "state",
    "error",
    "error_description",
    "error_uri",
  ])
  for (const key of url.searchParams.keys()) {
    if (!allowedParams.has(key)) {
      throw transactionError(
        "MALFORMED_CALLBACK",
        "The sign-in callback contained an unexpected parameter."
      )
    }
  }
  return url
}

/**
 * Receive a native deep-link callback. The transaction is consumed before the
 * exchange so a duplicate callback can never exchange the authorization code
 * twice, even if the first exchange is still in flight.
 */
export async function handleDesktopAuthCallback(
  value: string | URL
): Promise<SignInResult> {
  let url: URL
  try {
    url = callbackUrl(value)
  } catch (error) {
    const authError = error as DesktopAuthError
    if (activeTransaction && Date.now() >= activeTransaction.expiresAt) {
      timeoutTransaction()
    } else {
      setPendingError(authError)
    }
    throw authError
  }

  // Recover from storage when a webview reload or cold launch wiped the
  // in-memory transaction. The entry is removed the moment a transaction is
  // consumed, so a duplicate callback still finds nothing here and cannot replay.
  let transaction = activeTransaction
  if (!transaction) {
    const restored = readPersistedTransaction()
    if (restored) {
      activeTransaction = restored
      transaction = restored
    }
  }
  if (!transaction) {
    const error = transactionError(
      "NO_ACTIVE_TRANSACTION",
      "There is no active browser sign-in transaction."
    )
    if (snapshot.status !== "completed" && snapshot.status !== "cancelled") {
      setFailed(error)
    }
    throw error
  }

  if (Date.now() >= transaction.expiresAt) {
    timeoutTransaction()
    throw transactionError(
      "EXPIRED",
      "The browser sign-in transaction expired."
    )
  }

  const state = url.searchParams.get("state")
  if (!state || state !== transaction.state) {
    const error = transactionError(
      "STATE_MISMATCH",
      "The browser sign-in callback state did not match the active transaction."
    )
    setPendingError(error)
    throw error
  }

  const callbackError = url.searchParams.get("error")
  if (callbackError) {
    const description = url.searchParams.get("error_description")
    const error = transactionError(
      "CANCELLED",
      description || "Browser sign-in was cancelled."
    )
    clearTransaction()
    publish({
      status: "cancelled",
      pendingAction: transaction.pendingAction,
      expiresAt: null,
      result: null,
      error,
    })
    throw error
  }

  const code = url.searchParams.get("code")
  if (!code) {
    const error = transactionError(
      "MALFORMED_CALLBACK",
      "The browser sign-in callback did not contain an authorization code."
    )
    setPendingError(error)
    throw error
  }

  clearTransaction()
  const exchange: DesktopAuthExchangeInput = {
    code,
    state,
    codeVerifier: transaction.codeVerifier,
    redirectUri: transaction.redirectUri,
  }

  try {
    const result = await exchangeDesktopAuthorizationCode(exchange)
    publish({
      status: "completed",
      pendingAction: transaction.pendingAction,
      expiresAt: null,
      result,
      error: null,
    })
    return result
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "NETWORK"
        ? "OFFLINE"
        : "EXCHANGE_FAILED"
    const authError = transactionError(errorCode, errorMessage(error))
    setFailed(authError)
    throw authError
  }
}

/** Subscribe to transaction changes for the account UI or native bridge. */
export function subscribeDesktopAuth(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getDesktopAuthSnapshot(): DesktopAuthSnapshot {
  return snapshot
}

/**
 * Re-arm a pending browser login that a previous webview session persisted.
 * Called once on boot so a `tauri dev` hot reload (or any webview reload/crash)
 * keeps the account UI in its pending state and an arriving callback is treated
 * as solicited rather than unsolicited. No-ops when nothing valid is stored or a
 * login is already active, and drops an entry that has already expired.
 */
export function restoreDesktopLoginFromStorage(): void {
  if (activeTransaction) return
  const restored = readPersistedTransaction()
  if (!restored) return
  if (Date.now() >= restored.expiresAt) {
    clearPersistedTransaction()
    return
  }
  activeTransaction = restored
  clearTimer()
  timer = setTimeout(timeoutTransaction, restored.expiresAt - Date.now())
  publish({
    status: "pending",
    pendingAction: restored.pendingAction,
    expiresAt: restored.expiresAt,
    result: null,
    error: null,
  })
}

/** Clear a terminal result before the next login attempt. */
export function resetDesktopAuth(): void {
  if (activeTransaction) clearTransaction()
  publish({
    status: "idle",
    pendingAction: null,
    expiresAt: null,
    result: null,
    error: null,
  })
}
