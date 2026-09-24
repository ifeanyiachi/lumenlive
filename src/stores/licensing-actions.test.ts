import { beforeEach, describe, expect, it, vi } from "vitest"
import { LicensingError } from "@/services/lumenbo-client"
import { useTranscriptStore } from "./transcript-store"

/**
 * `revalidate()` must never throw and must report *why* a pass failed, so the
 * Account screen can surface the real backend error (auth expired, no seat,
 * offline, …) instead of falsely claiming success. These tests pin that
 * return-value contract.
 */

const validate = vi.fn()
const activate = vi.fn()
const signIn = vi.fn()
const listTeams = vi.fn()
const getOsInfo = vi.fn()
const deactivate = vi.fn()
const invoke = vi.fn()
vi.mock("@/services/licensing-gateway", () => ({
  validate: (...args: unknown[]) => validate(...args),
  activate: (...args: unknown[]) => activate(...args),
  deactivate: (...args: unknown[]) => deactivate(...args),
  signIn: (...args: unknown[]) => signIn(...args),
  listTeams: (...args: unknown[]) => listTeams(...args),
  getOsInfo: (...args: unknown[]) => getOsInfo(...args),
}))

const setSession = vi.fn()
const setActivationState = vi.fn()
const setPendingTeams = vi.fn()
const clearActivationState = vi.fn()
const clearSession = vi.fn(async () => {})
const authState: {
  token: string | null
  user: {
    id: string
    email: string
    name: string
    emailVerified: boolean
  } | null
  setSession: typeof setSession
  setActivationState: typeof setActivationState
  setPendingTeams: typeof setPendingTeams
  clearActivationState: typeof clearActivationState
  clearSession: typeof clearSession
} = {
  token: "auth-token",
  user: null,
  setSession,
  setActivationState,
  setPendingTeams,
  clearActivationState,
  clearSession,
}
vi.mock("./auth-store", () => ({
  useAuthStore: { getState: () => authState },
}))

const ensureMachineId = vi.fn(async () => "machine-1")
const applyToken = vi.fn(async () => "ok")
const clearEntitlement = vi.fn()
const restoreEntitlement = vi.fn()
const entState = {
  ensureMachineId,
  applyToken,
  clear: clearEntitlement,
  restore: restoreEntitlement,
  entitlement: { tier: "pro" as const },
  licenseToken: "stored-license-token",
  machineId: "machine-1" as string | null,
}
vi.mock("./entitlements-store", () => ({
  useEntitlementsStore: { getState: () => entState },
}))

const setTeams = vi.fn()
const selectTeam = vi.fn()
const clearTeams = vi.fn()
vi.mock("./team-store", () => ({
  useTeamStore: {
    getState: () => ({
      setTeams,
      selectTeam,
      clear: clearTeams,
      selectedOrganizationId: null,
    }),
  },
}))

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}))

import {
  activatePendingTeam,
  revalidate,
  signInAndActivate,
  signOut,
  switchTeam,
} from "./licensing-actions"

describe("revalidate", () => {
  beforeEach(() => {
    validate.mockReset()
    activate.mockReset()
    signIn.mockReset()
    listTeams.mockReset()
    getOsInfo.mockReset()
    setSession.mockReset()
    setActivationState.mockReset()
    setPendingTeams.mockReset()
    clearActivationState.mockReset()
    clearSession.mockReset()
    setTeams.mockReset()
    selectTeam.mockReset()
    clearEntitlement.mockReset()
    restoreEntitlement.mockReset()
    clearTeams.mockReset()
    deactivate.mockReset()
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
    ensureMachineId.mockClear()
    applyToken.mockReset()
    applyToken.mockResolvedValue("ok")
    authState.token = "auth-token"
    authState.user = null
    entState.entitlement = { tier: "pro" }
    entState.licenseToken = "stored-license-token"
    entState.machineId = "machine-1"
    useTranscriptStore.setState({
      isTranscribing: false,
      connectionStatus: "disconnected",
    })
  })

  it("auto-selects the only eligible team during sign-in", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    signIn.mockResolvedValue({ token: "new-auth-token", user })
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
      ],
      showSwitcher: false,
      defaultOrganizationId: "org-1",
    })
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    activate.mockResolvedValue({
      token: "signed-token",
      organizationId: "org-1",
    })

    const result = await signInAndActivate(
      "operator@example.com",
      "password123"
    )

    expect(result).toMatchObject({ kind: "activated" })
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "new-auth-token",
        organizationId: "org-1",
      })
    )
    expect(setSession).toHaveBeenCalledWith("new-auth-token", user)
    expect(setSession.mock.invocationCallOrder[0]).toBeLessThan(
      listTeams.mock.invocationCallOrder[0]
    )
    expect(clearEntitlement).toHaveBeenCalled()
    expect(clearTeams).toHaveBeenCalled()
    expect(clearActivationState).toHaveBeenCalled()
  })

  it("pauses for team selection when the account has multiple teams", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    signIn.mockResolvedValue({ token: "new-auth-token", user })
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
        {
          id: "org-2",
          name: "Second Church",
          role: "member",
          seat: true,
          status: "active",
          createdAt: "2026-09-21T00:00:00.000Z",
        },
      ],
      showSwitcher: true,
      defaultOrganizationId: null,
    })

    const result = await signInAndActivate(
      "operator@example.com",
      "password123"
    )

    expect(result).toMatchObject({
      kind: "select-team",
      pending: { token: "new-auth-token", user },
    })
    expect(activate).not.toHaveBeenCalled()
    expect(setSession).toHaveBeenCalledWith("new-auth-token", user)
    expect(setPendingTeams).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "org-1" }),
        expect.objectContaining({ id: "org-2" }),
      ])
    )
  })

  it("activates the explicitly selected team after a multi-team sign-in", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    const teams = [
      {
        id: "org-1",
        name: "Main Church",
        role: "owner",
        seat: true,
        status: "active" as const,
        createdAt: "2026-09-22T00:00:00.000Z",
      },
      {
        id: "org-2",
        name: "Second Church",
        role: "member",
        seat: true,
        status: "active" as const,
        createdAt: "2026-09-21T00:00:00.000Z",
      },
    ]
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    activate.mockResolvedValue({
      token: "team-2-license",
      organizationId: "org-2",
    })

    const result = await activatePendingTeam(
      { token: "new-auth-token", user, teams },
      "org-2"
    )

    expect(result).toEqual({
      license: expect.objectContaining({
        token: "team-2-license",
        organizationId: "org-2",
      }),
    })
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "new-auth-token",
        organizationId: "org-2",
      })
    )
    expect(selectTeam).toHaveBeenCalledWith("org-2")
    expect(clearActivationState).toHaveBeenCalled()
  })

  it("rejects a revoked team before attempting activation", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    const teams = [
      {
        id: "org-1",
        name: "Main Church",
        role: "owner",
        seat: true,
        status: "active" as const,
        createdAt: "2026-09-22T00:00:00.000Z",
      },
    ]

    await expect(
      activatePendingTeam(
        { token: "new-auth-token", user, teams },
        "revoked-org"
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" })
    expect(activate).not.toHaveBeenCalled()
  })

  it("keeps the authenticated session when activation fails", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    signIn.mockResolvedValue({ token: "new-auth-token", user })
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
      ],
      showSwitcher: false,
      defaultOrganizationId: "org-1",
    })
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    const activationError = new LicensingError(
      "DEVICE_LIMIT_REACHED",
      "This account has reached its device limit.",
      409
    )
    activate.mockRejectedValue(activationError)

    await expect(
      signInAndActivate("operator@example.com", "password123")
    ).rejects.toBe(activationError)

    expect(setSession).toHaveBeenCalledWith("new-auth-token", user)
    expect(setActivationState).toHaveBeenCalledWith(
      "failed",
      activationError.message,
      "DEVICE_LIMIT_REACHED"
    )
    expect(applyToken).not.toHaveBeenCalled()
  })

  it("rejects an activation license that fails local verification", async () => {
    const user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    signIn.mockResolvedValue({ token: "new-auth-token", user })
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
      ],
      showSwitcher: false,
      defaultOrganizationId: "org-1",
    })
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    activate.mockResolvedValue({
      token: "bad-license",
      organizationId: "org-1",
    })
    applyToken.mockResolvedValue("signature")

    await expect(
      signInAndActivate("operator@example.com", "password123")
    ).rejects.toMatchObject({ code: "LICENSE_INVALID" })

    expect(setActivationState).toHaveBeenCalledWith(
      "failed",
      expect.stringContaining("could not be verified"),
      "LICENSE_INVALID"
    )
    expect(clearActivationState).not.toHaveBeenCalled()
  })

  it("reports signed-out without hitting the backend", async () => {
    authState.token = null
    const result = await revalidate()
    expect(result).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
      message: expect.any(String),
    })
    expect(validate).not.toHaveBeenCalled()
  })

  it("applies a fresh token and reports the resulting tier", async () => {
    validate.mockResolvedValue({ token: "signed-token", tier: "pro" })
    const result = await revalidate()
    expect(applyToken).toHaveBeenCalledWith("signed-token", true)
    expect(result).toEqual({ ok: true, tier: "pro", reason: "ok" })
  })

  it("surfaces the backend error code instead of swallowing it", async () => {
    validate.mockRejectedValue(
      new LicensingError("NO_SEAT", "No operator seat", 409)
    )
    const result = await revalidate()
    expect(result).toEqual({
      ok: false,
      code: "NO_SEAT",
      message: "No operator seat",
    })
  })

  it("surfaces a network failure", async () => {
    validate.mockRejectedValue(new LicensingError("NETWORK", "offline", 0))
    const result = await revalidate()
    expect(result).toMatchObject({ ok: false, code: "NETWORK" })
    expect(clearEntitlement).not.toHaveBeenCalled()
    expect(clearTeams).not.toHaveBeenCalled()
  })

  it("clears the local entitlement after a terminal seat revocation", async () => {
    validate.mockRejectedValue(
      new LicensingError("NO_SEAT", "No operator seat", 409)
    )

    const result = await revalidate()

    expect(result).toMatchObject({ ok: false, code: "NO_SEAT" })
    expect(clearEntitlement).toHaveBeenCalled()
    expect(clearTeams).toHaveBeenCalled()
    expect(setActivationState).toHaveBeenCalledWith(
      "failed",
      "No operator seat",
      "NO_SEAT"
    )
  })

  it("reports a non-LicensingError as UNKNOWN rather than throwing", async () => {
    validate.mockRejectedValue(new Error("boom"))
    await expect(revalidate()).resolves.toMatchObject({
      ok: false,
      code: "UNKNOWN",
    })
  })

  it("switches teams by applying a fresh team-scoped license", async () => {
    authState.user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
        {
          id: "org-2",
          name: "Second Church",
          role: "member",
          seat: true,
          status: "active",
          createdAt: "2026-09-21T00:00:00.000Z",
        },
      ],
      showSwitcher: true,
      defaultOrganizationId: null,
    })
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    activate.mockResolvedValue({
      token: "team-2-license",
      organizationId: "org-2",
    })

    await switchTeam("org-2")

    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-2" })
    )
    expect(applyToken).toHaveBeenCalledWith("team-2-license", true)
    expect(selectTeam).toHaveBeenCalledWith("org-2")
  })

  it("preserves the previous entitlement when a team switch fails", async () => {
    authState.user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    listTeams.mockResolvedValue({
      teams: [
        {
          id: "org-1",
          name: "Main Church",
          role: "owner",
          seat: true,
          status: "active",
          createdAt: "2026-09-22T00:00:00.000Z",
        },
        {
          id: "org-2",
          name: "Second Church",
          role: "member",
          seat: true,
          status: "active",
          createdAt: "2026-09-21T00:00:00.000Z",
        },
      ],
      showSwitcher: true,
      defaultOrganizationId: null,
    })
    getOsInfo.mockResolvedValue({
      os: "Windows",
      version: "11",
      arch: "x64",
      hostname: "desktop-1",
    })
    activate.mockRejectedValue(
      new LicensingError("NO_SEAT", "The second team has no seat.", 409)
    )

    await expect(switchTeam("org-2")).rejects.toMatchObject({
      code: "NO_SEAT",
    })
    expect(restoreEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({ licenseToken: "stored-license-token" })
    )
    expect(selectTeam).not.toHaveBeenCalled()
  })

  it("blocks a team switch while transcription is active", async () => {
    useTranscriptStore.setState({
      isTranscribing: true,
      connectionStatus: "connected",
    })

    await expect(switchTeam("org-2")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    })
    expect(listTeams).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
  })

  it("stops transcription before deactivating and clearing account state", async () => {
    authState.user = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      emailVerified: true,
    }
    entState.machineId = "machine-1"
    deactivate.mockResolvedValue({ machineId: "machine-1" })

    await signOut()

    expect(invoke).toHaveBeenCalledWith("stop_transcription")
    expect(deactivate).toHaveBeenCalledWith("auth-token", "machine-1")
    expect(invoke.mock.invocationCallOrder[0]).toBeLessThan(
      deactivate.mock.invocationCallOrder[0]
    )
    expect(deactivate.mock.invocationCallOrder[0]).toBeLessThan(
      authState.clearSession.mock.invocationCallOrder[0]
    )
    expect(authState.clearSession).toHaveBeenCalled()
    expect(clearEntitlement).toHaveBeenCalled()
    expect(clearTeams).toHaveBeenCalled()
  })
})
