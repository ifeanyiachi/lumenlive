import { describe, expect, it } from "vitest"
import {
  MANIFEST_VERSION,
  ManifestParseError,
  parseManifest,
  SUPPORTED_RESOURCE_SCHEMA,
} from "./manifest"

/** A valid bundled-free Bible resource, as it would appear in the manifest. */
function bibleEntry(overrides: Record<string, unknown> = {}) {
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
    url: "https://cdn.example/store/bibles/web.db.zst",
    sha256: "a".repeat(64),
    bytes: 1234,
    ...overrides,
  }
}

function manifest(
  resources: unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    version: MANIFEST_VERSION,
    generatedAt: "2026-07-28T00:00:00Z",
    resources,
    ...overrides,
  }
}

describe("parseManifest — top-level validation", () => {
  it("throws on a non-object document", () => {
    expect(() => parseManifest(null)).toThrow(ManifestParseError)
    expect(() => parseManifest([])).toThrow(ManifestParseError)
  })

  it("throws when version is missing or non-numeric", () => {
    expect(() => parseManifest({ generatedAt: "x", resources: [] })).toThrow(
      /numeric version/
    )
  })

  it("throws when the manifest version is newer than supported", () => {
    expect(() =>
      parseManifest(manifest([], { version: MANIFEST_VERSION + 1 }))
    ).toThrow(/newer than supported/)
  })

  it("throws when generatedAt is missing", () => {
    expect(() =>
      parseManifest({ version: MANIFEST_VERSION, resources: [] })
    ).toThrow(/generatedAt/)
  })

  it("throws when resources is not an array", () => {
    expect(() =>
      parseManifest(manifest("nope" as unknown as unknown[]))
    ).toThrow(/not an array/)
  })
})

describe("parseManifest — resource validation", () => {
  it("parses a valid bible entry with all fields", () => {
    const { manifest: m, warnings } = parseManifest(manifest([bibleEntry()]))
    expect(warnings).toEqual([])
    expect(m.resources).toHaveLength(1)
    expect(m.resources[0]).toMatchObject({
      kind: "bible",
      id: "web",
      abbreviation: "WEB",
      bytes: 1234,
    })
  })

  it("parses a byo-import entry that omits download fields", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([
        bibleEntry({
          id: "niv",
          abbreviation: "NIV",
          url: undefined,
          sha256: undefined,
          bytes: undefined,
          license: {
            name: "Zondervan NIV",
            copyrighted: true,
            distribution: "byo-import",
          },
        }),
      ])
    )
    expect(warnings).toEqual([])
    expect(m.resources[0]).not.toHaveProperty("url")
    expect(m.resources[0].license.copyrighted).toBe(true)
  })

  it("skips unknown resource kinds with a warning, keeping valid ones", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([bibleEntry(), { kind: "spaceship", id: "x" }])
    )
    expect(m.resources).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/unknown resource kind/)
  })

  it("skips not-yet-supported kinds (theme/background) without failing", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([
        { kind: "slide-theme", id: "midnight" },
        { kind: "background", id: "waves" },
      ])
    )
    expect(m.resources).toHaveLength(0)
    expect(warnings).toHaveLength(2)
    expect(warnings.join()).toMatch(/not supported/)
  })

  it("skips a bible entry whose schemaVersion exceeds support", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([bibleEntry({ schemaVersion: SUPPORTED_RESOURCE_SCHEMA + 1 })])
    )
    expect(m.resources).toHaveLength(0)
    expect(warnings[0]).toMatch(/schemaVersion/)
  })

  it("skips entries missing required fields", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([
        bibleEntry({ abbreviation: undefined }),
        bibleEntry({ id: "ok2" }),
      ])
    )
    expect(m.resources).toHaveLength(1)
    expect(m.resources[0].id).toBe("ok2")
    expect(warnings[0]).toMatch(/missing abbreviation/)
  })

  it("rejects an entry with an invalid license distribution", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([
        bibleEntry({
          license: {
            name: "Weird",
            copyrighted: false,
            distribution: "pirated",
          },
        }),
      ])
    )
    expect(m.resources).toHaveLength(0)
    expect(warnings[0]).toMatch(/invalid license/)
  })

  it("rejects an entry with a partial/invalid download descriptor", () => {
    const { warnings } = parseManifest(manifest([bibleEntry({ bytes: -5 })]))
    expect(warnings[0]).toMatch(/invalid bytes/)
  })

  it("de-duplicates entries sharing kind+id, keeping the first", () => {
    const { manifest: m, warnings } = parseManifest(
      manifest([
        bibleEntry({ title: "First" }),
        bibleEntry({ title: "Second" }),
      ])
    )
    expect(m.resources).toHaveLength(1)
    expect(m.resources[0].title).toBe("First")
    expect(warnings[0]).toMatch(/duplicate/)
  })
})
