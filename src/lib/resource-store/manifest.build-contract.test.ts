/**
 * Contract test locking the output of `data/build-store-manifest.ts` to what
 * this client's `parseManifest` accepts. The build script emits the shape
 * encoded here (a hosted `bundled-free` bible plus a `byo-import` placeholder);
 * if either side drifts, this fails in CI instead of silently dropping entries
 * on a user's machine. Kept independent of the generated (gitignored) artifacts
 * so it runs everywhere — the fixture mirrors the builder's emitted fields.
 */

import { describe, expect, it } from "vitest"
import { diffCatalog } from "./diff"
import { canInstall } from "./license"
import { parseManifest } from "./manifest"

/** A manifest shaped exactly like build-store-manifest.ts emits. */
const BUILT_MANIFEST = {
  version: 1,
  generatedAt: "2026-07-28T17:31:35.590Z",
  resources: [
    {
      kind: "bible",
      id: "spa-rv1909",
      title: "Reina-Valera 1909",
      abbreviation: "SpaRV",
      language: "es",
      license: {
        name: "Public Domain",
        copyrighted: false,
        distribution: "bundled-free",
      },
      schemaVersion: 1,
      url: "https://pub-82480c48c8b84f8ca5162b8d42bd99d0.r2.dev/store/bibles/spa-rv1909.db.zst",
      sha256:
        "ad281f49e8f3e160569fc3346bfc8421e0a361d5e0718c97d2b12b3d35046865",
      bytes: 1516067,
    },
    {
      kind: "bible",
      id: "esv",
      title: "English Standard Version",
      abbreviation: "ESV",
      language: "en",
      license: {
        name: "Crossway ESV License",
        copyrighted: true,
        distribution: "byo-import",
      },
      schemaVersion: 1,
    },
  ],
}

describe("build-store-manifest output ↔ parseManifest contract", () => {
  const { manifest, warnings } = parseManifest(BUILT_MANIFEST)

  it("parses every emitted entry with no warnings", () => {
    expect(warnings).toEqual([])
    expect(manifest.resources.map((r) => r.id)).toEqual(["spa-rv1909", "esv"])
  })

  it("gates install by distribution: free installable, byo not", () => {
    const [free, byo] = manifest.resources
    expect(canInstall(free).ok).toBe(true)
    expect(canInstall(byo).ok).toBe(false)
  })

  it("diffs to available / byo-import when nothing is installed", () => {
    const byStatus = Object.fromEntries(
      diffCatalog(manifest, []).map((e) => [e.resource.id, e.status])
    )
    expect(byStatus["spa-rv1909"]).toBe("available")
    expect(byStatus["esv"]).toBe("byo-import")
  })
})
