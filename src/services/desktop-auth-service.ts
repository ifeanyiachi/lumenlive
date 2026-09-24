import { appUrl } from "@/lib/app-urls"
import {
  exchangeDesktopAuthorizationCode,
  type DesktopAuthExchangeInput,
} from "@/services/licensing-gateway"
import type { SignInResult } from "@/services/lumenbo-client"
import { openExternalUrl } from "./external-link-gateway"

export const DESKTOP_AUTH_REDIRECT_URI = "lumenlive://auth/callback"
const LOGIN_URL = appUrl("/login")
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

function clearTransaction() {
  clearTimer()
  activeTransaction = null
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
  const url = new URL(LOGIN_URL)
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

  const transaction = activeTransaction
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
