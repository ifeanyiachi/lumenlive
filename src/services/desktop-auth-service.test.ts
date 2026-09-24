import { beforeEach, describe, expect, it, vi } from "vitest"

const openExternalUrl = vi.fn<(url: string) => Promise<boolean>>(
  async () => true
)
const exchangeDesktopAuthorizationCode = vi.fn()

vi.mock("./external-link-gateway", () => ({
  openExternalUrl: (...args: [string]) => openExternalUrl(...args),
}))

vi.mock("./licensing-gateway", () => ({
  exchangeDesktopAuthorizationCode: (...args: unknown[]) =>
    exchangeDesktopAuthorizationCode(...args),
}))

import {
  cancelDesktopLogin,
  getDesktopAuthSnapshot,
  handleDesktopAuthCallback,
  resetDesktopAuth,
  startDesktopLogin,
} from "./desktop-auth-service"

const authResult = {
  token: "bearer-token",
  user: {
    id: "user-1",
    email: "operator@example.com",
    name: "Operator",
    emailVerified: true,
  },
}

function callbackUrl(overrides: Record<string, string> = {}) {
  const loginUrl = new URL(openExternalUrl.mock.calls[0]?.[0] ?? "")
  const params = new URLSearchParams({
    code: "one-time-code",
    state: loginUrl.searchParams.get("state") ?? "",
    ...overrides,
  })
  return `lumenlive://auth/callback?${params.toString()}`
}

describe("desktop auth service", () => {
  beforeEach(() => {
    vi.useRealTimers()
    openExternalUrl.mockReset()
    openExternalUrl.mockResolvedValue(true)
    exchangeDesktopAuthorizationCode.mockReset()
    exchangeDesktopAuthorizationCode.mockResolvedValue(authResult)
    resetDesktopAuth()
  })

  it("creates a PKCE browser transaction without exposing the verifier", async () => {
    const snapshot = await startDesktopLogin("start-transcription")
    const loginUrl = new URL(openExternalUrl.mock.calls[0]?.[0] ?? "")

    expect(snapshot.status).toBe("pending")
    expect(snapshot.pendingAction).toBe("start-transcription")
    expect(loginUrl.pathname).toBe("/login")
    expect(loginUrl.searchParams.get("desktop")).toBe("1")
    expect(loginUrl.searchParams.get("redirect_uri")).toBe(
      "lumenlive://auth/callback"
    )
    expect(loginUrl.searchParams.get("code_challenge_method")).toBe("S256")
    expect(loginUrl.searchParams.get("code_challenge")).toMatch(
      /^[A-Za-z0-9_-]+$/
    )
    expect(loginUrl.searchParams.has("code_verifier")).toBe(false)
  })

  it("rejects concurrent login attempts without replacing the active transaction", async () => {
    await startDesktopLogin()

    await expect(startDesktopLogin()).rejects.toMatchObject({
      code: "ALREADY_PENDING",
    })
    expect(getDesktopAuthSnapshot().status).toBe("pending")
  })

  it("validates state, exchanges once, and returns the existing auth shape", async () => {
    await startDesktopLogin()
    const result = await handleDesktopAuthCallback(callbackUrl())

    expect(result).toEqual(authResult)
    expect(exchangeDesktopAuthorizationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "one-time-code",
        state: expect.any(String),
        codeVerifier: expect.any(String),
        redirectUri: "lumenlive://auth/callback",
      })
    )
    expect(getDesktopAuthSnapshot().status).toBe("completed")

    await expect(
      handleDesktopAuthCallback(callbackUrl())
    ).rejects.toMatchObject({ code: "NO_ACTIVE_TRANSACTION" })
    expect(exchangeDesktopAuthorizationCode).toHaveBeenCalledTimes(1)
  })

  it("rejects a mismatched state without consuming the valid transaction", async () => {
    await startDesktopLogin()

    await expect(
      handleDesktopAuthCallback(callbackUrl({ state: "wrong-state" }))
    ).rejects.toMatchObject({ code: "STATE_MISMATCH" })
    expect(exchangeDesktopAuthorizationCode).not.toHaveBeenCalled()

    await handleDesktopAuthCallback(callbackUrl())
    expect(exchangeDesktopAuthorizationCode).toHaveBeenCalledTimes(1)
  })

  it("cancels and invalidates the transaction", async () => {
    await startDesktopLogin("open-account")
    cancelDesktopLogin()

    expect(getDesktopAuthSnapshot()).toMatchObject({
      status: "cancelled",
      pendingAction: "open-account",
    })
    await expect(
      handleDesktopAuthCallback(callbackUrl())
    ).rejects.toMatchObject({ code: "NO_ACTIVE_TRANSACTION" })
    expect(exchangeDesktopAuthorizationCode).not.toHaveBeenCalled()
  })

  it("turns a browser-declined callback into a cancelled result", async () => {
    await startDesktopLogin("open-account")

    await expect(
      handleDesktopAuthCallback(
        callbackUrl({
          code: "",
          error: "access_denied",
          error_description: "The operator closed the browser sign-in.",
        })
      )
    ).rejects.toMatchObject({
      code: "CANCELLED",
      message: "The operator closed the browser sign-in.",
    })

    expect(getDesktopAuthSnapshot()).toMatchObject({
      status: "cancelled",
      pendingAction: "open-account",
    })
    expect(exchangeDesktopAuthorizationCode).not.toHaveBeenCalled()
  })

  it("times out and invalidates an abandoned transaction", async () => {
    vi.useFakeTimers()
    await startDesktopLogin()
    vi.advanceTimersByTime(10 * 60 * 1000)

    expect(getDesktopAuthSnapshot().status).toBe("timed-out")
    await expect(
      handleDesktopAuthCallback(callbackUrl())
    ).rejects.toMatchObject({ code: "NO_ACTIVE_TRANSACTION" })
  })

  it("maps an offline code exchange to a recoverable offline state", async () => {
    exchangeDesktopAuthorizationCode.mockRejectedValue({
      code: "NETWORK",
      message: "network down",
    })
    await startDesktopLogin()

    await expect(
      handleDesktopAuthCallback(callbackUrl())
    ).rejects.toMatchObject({ code: "OFFLINE" })
    expect(getDesktopAuthSnapshot()).toMatchObject({
      status: "failed",
      error: { code: "OFFLINE" },
    })
  })

  it("consumes the transaction before an in-flight exchange can be replayed", async () => {
    let resolveExchange: (value: typeof authResult) => void = () => {}
    exchangeDesktopAuthorizationCode.mockReturnValue(
      new Promise((resolve) => {
        resolveExchange = resolve
      })
    )
    await startDesktopLogin()

    const firstCallback = handleDesktopAuthCallback(callbackUrl())
    await expect(
      handleDesktopAuthCallback(callbackUrl())
    ).rejects.toMatchObject({ code: "NO_ACTIVE_TRANSACTION" })

    resolveExchange(authResult)
    await expect(firstCallback).resolves.toEqual(authResult)
    expect(exchangeDesktopAuthorizationCode).toHaveBeenCalledTimes(1)
  })

  it("rejects credential-bearing callbacks", async () => {
    await startDesktopLogin()

    await expect(
      handleDesktopAuthCallback(`${callbackUrl()}&token=unexpected`)
    ).rejects.toMatchObject({ code: "MALFORMED_CALLBACK" })
    expect(exchangeDesktopAuthorizationCode).not.toHaveBeenCalled()
  })
})
