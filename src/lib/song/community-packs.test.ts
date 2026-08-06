import { describe, it, expect } from "vitest"
import {
  COMMUNITY_PACKS,
  installedPacks,
  packLabelFromUrl,
  stampImportBatch,
} from "./community-packs"
import { createDefaultSong } from "@/types/song"

describe("COMMUNITY_PACKS catalog", () => {
  it("has unique ids", () => {
    const ids = COMMUNITY_PACKS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("points every pack at an https URL", () => {
    for (const pack of COMMUNITY_PACKS) {
      expect(pack.url).toMatch(/^https:\/\//)
    }
  })

  it("gives every pack the fields the store card renders", () => {
    for (const pack of COMMUNITY_PACKS) {
      expect(pack.name).toBeTruthy()
      expect(pack.author).toBeTruthy()
      expect(pack.description).toBeTruthy()
      expect(pack.formats).toBeTruthy()
      expect(pack.language).toBeTruthy()
    }
  })
})

describe("stampImportBatch", () => {
  it("stamps every song with the batch id and source", () => {
    const songs = [createDefaultSong("A"), createDefaultSong("B")]
    const stamped = stampImportBatch(songs, "pack-1", "My Pack")
    expect(stamped).toHaveLength(2)
    for (const song of stamped) {
      expect(song.importBatchId).toBe("pack-1")
      expect(song.importSource).toBe("My Pack")
    }
  })

  it("does not mutate the input songs", () => {
    const songs = [createDefaultSong("A")]
    stampImportBatch(songs, "pack-1", "My Pack")
    expect(songs[0].importBatchId).toBeUndefined()
    expect(songs[0].importSource).toBeUndefined()
  })

  it("returns an empty array for an empty batch", () => {
    expect(stampImportBatch([], "pack-1", "My Pack")).toEqual([])
  })
})

describe("packLabelFromUrl", () => {
  it("shortens a GitHub URL to owner/repo", () => {
    expect(packLabelFromUrl("https://github.com/mattgraham/worship")).toBe(
      "mattgraham/worship"
    )
    expect(packLabelFromUrl("https://github.com/owner/repo/tree/main")).toBe(
      "owner/repo"
    )
  })

  it("falls back to the host for a bare domain", () => {
    expect(packLabelFromUrl("https://example.com")).toBe("example.com")
  })

  it("returns the raw string when it isn't a URL", () => {
    expect(packLabelFromUrl("not a url")).toBe("not a url")
  })
})

describe("installedPacks", () => {
  it("ignores songs with no import batch", () => {
    const songs = [createDefaultSong("A"), createDefaultSong("B")]
    expect(installedPacks(songs)).toEqual([])
  })

  it("groups a batch and counts its songs", () => {
    const songs = stampImportBatch(
      [createDefaultSong("A"), createDefaultSong("B")],
      "https://github.com/owner/repo",
      "owner/repo"
    )
    const packs = installedPacks(songs)
    expect(packs).toHaveLength(1)
    expect(packs[0]).toMatchObject({
      batchId: "https://github.com/owner/repo",
      name: "owner/repo",
      count: 2,
      pack: undefined,
    })
  })

  it("links a batch to its curated catalog entry by id", () => {
    const curated = COMMUNITY_PACKS[0]
    const songs = stampImportBatch(
      [createDefaultSong("A")],
      curated.id,
      curated.name
    )
    const packs = installedPacks(songs)
    expect(packs[0].pack).toBe(curated)
  })

  it("falls back to a URL-derived name when importSource is absent", () => {
    const [song] = stampImportBatch(
      [createDefaultSong("A")],
      "https://github.com/owner/repo",
      "owner/repo"
    )
    // Simulate a legacy song stamped before names were stored.
    const legacy = { ...song, importSource: undefined }
    expect(installedPacks([legacy])[0].name).toBe("owner/repo")
  })
})
