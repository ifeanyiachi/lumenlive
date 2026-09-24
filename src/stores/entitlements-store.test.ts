import { beforeEach, describe, expect, it, vi } from "vitest"
import { FREE_ENTITLEMENT } from "@/lib/entitlements"

const getMachineId = vi.fn(async () => "machine-1")
const verifyLicense = vi.fn()
const store = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  save: vi.fn(),
}
const load = vi.fn(async () => store)

vi.mock("@/services/licensing-gateway", () => ({
  getMachineId: () => getMachineId(),
  verifyLicense: (token: string, machineId: string) =>
    verifyLicense(token, machineId),
}))

vi.mock("@tauri-apps/plugin-store", () => ({
  load: () => load(),
}))

import { useEntitlementsStore } from "./entitlements-store"

const claims = {
  sub: "machine-1",
  tier: "pro",
  features: ["cloud_stt", "media"],
  limits: {
    maxDevices: 2,
    maxTranslations: 10,
    maxTranscriptionMinutes: -1,
  },
  machineId: "machine-1",
  trialEnd: null,
  expiresAt: 1_900_000_000,
  issuedAt: 1_800_000_000,
  graceDays: 7,
}

describe("entitlements store verification lifecycle", () => {
  beforeEach(() => {
    getMachineId.mockClear()
    verifyLicense.mockReset()
    load.mockClear()
    store.get.mockReset()
    store.set.mockReset()
    store.delete.mockReset()
    store.save.mockReset()
    useEntitlementsStore.setState({
      entitlement: FREE_ENTITLEMENT,
      reason: "free",
      licenseToken: null,
      lastValidatedAt: null,
      machineId: null,
    })
  })

  it("restores a persisted license only after local verification", async () => {
    store.get.mockImplementation(async (key: string) =>
      key === "token" ? "persisted-license" : 1_800_000_000
    )
    verifyLicense.mockResolvedValue({ valid: true, reason: "ok", claims })

    await useEntitlementsStore.getState().hydrate()

    expect(verifyLicense).toHaveBeenCalledWith("persisted-license", "machine-1")
    expect(useEntitlementsStore.getState()).toMatchObject({
      entitlement: expect.objectContaining({ tier: "pro" }),
      reason: "ok",
      licenseToken: "persisted-license",
    })
  })

  it("falls back to Free after an expired license while retaining it for refresh", async () => {
    verifyLicense.mockResolvedValue({
      valid: false,
      reason: "expired",
      claims: null,
    })

    await useEntitlementsStore.getState().applyToken("expired-license")

    expect(useEntitlementsStore.getState()).toMatchObject({
      entitlement: FREE_ENTITLEMENT,
      reason: "expired",
      licenseToken: "expired-license",
    })
  })

  it("discards a hard-invalid license instead of reviving it offline", async () => {
    verifyLicense.mockResolvedValue({
      valid: false,
      reason: "machine_mismatch",
      claims: null,
    })

    await useEntitlementsStore.getState().applyToken("wrong-machine-license")

    expect(useEntitlementsStore.getState()).toMatchObject({
      entitlement: FREE_ENTITLEMENT,
      reason: "machine_mismatch",
      licenseToken: null,
    })
    expect(store.delete).toHaveBeenCalledWith("token")
  })
})
