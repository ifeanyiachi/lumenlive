import { describe, expect, it } from "vitest"
import type { BibleResource } from "@/types/resource-store"
import { canInstall, isFreelyInstallable, requiresUserImport } from "./license"

function bible(overrides: Partial<BibleResource> = {}): BibleResource {
  return {
    kind: "bible",
    id: "web",
    title: "World English Bible",
    abbreviation: "WEB",
    language: "en",
    schemaVersion: 1,
    license: {
      name: "Public Domain",
      copyrighted: false,
      distribution: "bundled-free",
    },
    url: "https://cdn.example/web.db.zst",
    sha256: "a".repeat(64),
    bytes: 100,
    ...overrides,
  }
}

const byoImport = bible({
  id: "niv",
  license: { name: "NIV", copyrighted: true, distribution: "byo-import" },
  url: undefined,
  sha256: undefined,
  bytes: undefined,
})

describe("distribution predicates", () => {
  it("classifies bundled-free vs byo-import", () => {
    expect(isFreelyInstallable(bible())).toBe(true)
    expect(requiresUserImport(bible())).toBe(false)
    expect(isFreelyInstallable(byoImport)).toBe(false)
    expect(requiresUserImport(byoImport)).toBe(true)
  })
})

describe("canInstall", () => {
  it("allows a complete bundled-free resource", () => {
    expect(canInstall(bible())).toEqual({ ok: true })
  })

  it("blocks a byo-import resource with a reason", () => {
    const result = canInstall(byoImport)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/licensed to use/)
  })

  it("blocks a bundled-free resource missing download fields", () => {
    const result = canInstall(bible({ sha256: undefined }))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no verified download/)
  })

  it("blocks when bytes is absent even though url/sha are present", () => {
    expect(canInstall(bible({ bytes: undefined })).ok).toBe(false)
  })
})
