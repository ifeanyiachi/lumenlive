import { describe, expect, it } from "vitest"
import type {
  BibleResource,
  InstalledResource,
  Manifest,
} from "@/types/resource-store"
import { bundledInstalledRecords, diffCatalog } from "./diff"

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

function manifest(resources: BibleResource[]): Manifest {
  return { version: 1, generatedAt: "2026-07-28T00:00:00Z", resources }
}

function installed(
  id: string,
  schemaVersion = 1,
  refId?: number
): InstalledResource {
  return { id, kind: "bible", schemaVersion, refId }
}

describe("diffCatalog", () => {
  it("tags a not-installed bundled-free resource as available", () => {
    const [entry] = diffCatalog(manifest([bible()]), [])
    expect(entry.status).toBe("available")
    expect(entry.installed).toBeUndefined()
  })

  it("tags a not-installed copyrighted resource as byo-import", () => {
    const niv = bible({
      id: "niv",
      license: { name: "NIV", copyrighted: true, distribution: "byo-import" },
    })
    const [entry] = diffCatalog(manifest([niv]), [])
    expect(entry.status).toBe("byo-import")
  })

  it("tags an installed resource at the same schema as installed", () => {
    const [entry] = diffCatalog(manifest([bible()]), [
      installed("web", 1, 1000),
    ])
    expect(entry.status).toBe("installed")
    expect(entry.installed?.refId).toBe(1000)
  })

  it("tags an installed resource with a newer catalog schema as update-available", () => {
    const [entry] = diffCatalog(manifest([bible({ schemaVersion: 2 })]), [
      installed("web", 1),
    ])
    expect(entry.status).toBe("update-available")
  })

  it("does not downgrade to update when installed schema is ahead", () => {
    const [entry] = diffCatalog(manifest([bible({ schemaVersion: 1 })]), [
      installed("web", 2),
    ])
    expect(entry.status).toBe("installed")
  })

  it("matches on kind+id, not id alone", () => {
    // An installed record for a different kind must not match a bible entry.
    const [entry] = diffCatalog(manifest([bible()]), [
      { id: "web", kind: "background", schemaVersion: 1 },
    ])
    expect(entry.status).toBe("available")
  })

  it("preserves manifest order", () => {
    const entries = diffCatalog(
      manifest([bible({ id: "a" }), bible({ id: "b" }), bible({ id: "c" })]),
      []
    )
    expect(entries.map((e) => e.resource.id)).toEqual(["a", "b", "c"])
  })
})

describe("bundledInstalledRecords", () => {
  const kjv = bible({ id: "kjv", abbreviation: "KJV" })
  const niv = bible({ id: "niv", abbreviation: "NIV" })

  it("marks a bundled translation as an installed+bundled record", () => {
    const [rec] = bundledInstalledRecords(manifest([kjv, niv]), ["KJV"])
    expect(rec).toEqual({
      id: "kjv",
      kind: "bible",
      schemaVersion: 1,
      bundled: true,
    })
  })

  it("matches abbreviation case-insensitively", () => {
    const recs = bundledInstalledRecords(manifest([kjv]), ["kjv"])
    expect(recs.map((r) => r.id)).toEqual(["kjv"])
  })

  it("ignores translations that aren't in the catalog", () => {
    // A bundled abbreviation with no manifest entry produces nothing.
    expect(bundledInstalledRecords(manifest([niv]), ["KJV"])).toEqual([])
  })

  it("makes bundled entries read as installed and non-removable via diffCatalog", () => {
    const m = manifest([kjv, niv])
    const bundled = bundledInstalledRecords(m, ["KJV"])
    const byId = Object.fromEntries(
      diffCatalog(m, bundled).map((e) => [e.resource.id, e])
    )
    // KJV: installed, bundled, no refId → the UI hides Remove.
    expect(byId["kjv"].status).toBe("installed")
    expect(byId["kjv"].installed?.bundled).toBe(true)
    expect(byId["kjv"].installed?.refId).toBeUndefined()
    // NIV: still a normal available download.
    expect(byId["niv"].status).toBe("available")
  })

  it("lets a real download win the key collision when placed after bundled", () => {
    // If a slug is both bundled and downloaded, feeding downloaded last keeps it
    // removable (mirrors loadCatalog's ordering).
    const m = manifest([kjv])
    const bundled = bundledInstalledRecords(m, ["KJV"])
    const [entry] = diffCatalog(m, [...bundled, installed("kjv", 1, 1000)])
    expect(entry.status).toBe("installed")
    expect(entry.installed?.refId).toBe(1000)
    expect(entry.installed?.bundled).toBeUndefined()
  })
})
