import { beforeEach, describe, expect, it, vi } from "vitest"
import { LicensingError } from "@/services/lumenbo-client"

/**
 * `revalidate()` must never throw and must report *why* a pass failed, so the
 * Account screen can surface the real backend error (auth expired, no seat,
 * offline, …) instead of falsely claiming success. These tests pin that
 * return-value contract.
 */

const validate = vi.fn()
vi.mock("@/services/licensing-gateway", () => ({
  validate: (...args: unknown[]) => validate(...args),
  activate: vi.fn(),
  deactivate: vi.fn(),
  signIn: vi.fn(),
  getOsInfo: vi.fn(),
}))

const authState: { token: string | null } = { token: "auth-token" }
vi.mock("./auth-store", () => ({
  useAuthStore: { getState: () => authState },
}))

const ensureMachineId = vi.fn(async () => "machine-1")
const applyToken = vi.fn(async () => "ok")
const entState = {
  ensureMachineId,
  applyToken,
  entitlement: { tier: "pro" as const },
}
vi.mock("./entitlements-store", () => ({
  useEntitlementsStore: { getState: () => entState },
}))

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

import { revalidate } from "./licensing-actions"

describe("revalidate", () => {
  beforeEach(() => {
    validate.mockReset()
    ensureMachineId.mockClear()
    applyToken.mockReset()
    applyToken.mockResolvedValue("ok")
    authState.token = "auth-token"
    entState.entitlement = { tier: "pro" }
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
  })

  it("reports a non-LicensingError as UNKNOWN rather than throwing", async () => {
    validate.mockRejectedValue(new Error("boom"))
    await expect(revalidate()).resolves.toMatchObject({
      ok: false,
      code: "UNKNOWN",
    })
  })
})
