import { describe, it, expect } from "vitest"
import type { MediaAsset } from "@/types/media"
import type { Theme } from "@/types/theme"
import type { ServiceSchedule } from "@/types/schedule"
import type { ExtractedMedia } from "@/types/bundle"
import { createDefaultPresentation } from "@/lib/slide-defaults"
import {
  buildBackup,
  parseBackup,
  BackupParseError,
  type BackupContent,
} from "./backup"

const assetUrl = (p: string) => `http://asset.localhost/${encodeURIComponent(p)}`

function asset(id: string, filePath: string): MediaAsset {
  return { id, name: id, type: "image", filePath, fileSize: 1, tags: [], addedAt: 0 }
}

function extract(files: { srcPath: string; zipName: string }[]): ExtractedMedia[] {
  return files.map((m) => ({ zipName: m.zipName, path: `/managed/${m.zipName}` }))
}

function emptyContent(): BackupContent {
  return {
    themes: [],
    stageLayouts: [],
    presentations: [],
    songs: [],
    schedules: [],
    mediaAssets: [],
    countdownTimers: [],
    alertTemplates: [],
    webBookmarks: [],
  }
}

function scenario(): BackupContent {
  const a1 = asset("asset-1", "C:\\media\\bg.png")

  const theme: Theme = {
    id: "theme-1",
    name: "Look",
    type: "scripture",
    builtin: false,
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: {
      type: "image",
      mediaAssetId: "asset-1",
      imageUrl: assetUrl(a1.filePath),
    },
    elements: [],
  }

  const deck = createDefaultPresentation("Deck")
  deck.id = "pres-1"
  deck.slides[0].background = {
    type: "image",
    mediaAssetId: "asset-1",
    imageUrl: assetUrl(a1.filePath),
  }

  const schedule: ServiceSchedule = {
    id: "sched-1",
    name: "Sunday",
    createdAt: 0,
    updatedAt: 0,
    items: [
      {
        id: "m1",
        type: "media",
        label: "Clip",
        order: 0,
        mediaAssetId: "asset-1",
        cachedFilePath: "C:\\media\\bg.png",
        cachedMediaType: "image",
      },
    ],
  }

  return {
    ...emptyContent(),
    themes: [theme],
    presentations: [deck],
    schedules: [schedule],
    mediaAssets: [a1],
  }
}

describe("buildBackup", () => {
  it("packages the whole media library once", () => {
    const content = scenario()
    const { manifest, mediaFiles, missingMedia } = buildBackup(content, 42)
    expect(manifest.format).toBe("lumenlive.backup")
    expect(missingMedia).toBe(0)
    // One unique file, asset-backed.
    expect(manifest.media).toHaveLength(1)
    expect(manifest.media[0].srcPath).toBe("C:\\media\\bg.png")
    expect(manifest.media[0].asset?.id).toBe("asset-1")
    expect(mediaFiles).toHaveLength(1)
  })

  it("counts a media asset whose source file is unknown as missing when it has no path", () => {
    const content = { ...emptyContent(), mediaAssets: [asset("x", "")] }
    const { missingMedia, manifest } = buildBackup(content, 1)
    expect(missingMedia).toBe(1)
    expect(manifest.media).toHaveLength(0)
  })
})

describe("parseBackup", () => {
  it("preserves ids and re-points every media reference", () => {
    const content = scenario()
    const { manifest, mediaFiles } = buildBackup(content, 1)

    const parsed = parseBackup(manifest, extract(mediaFiles), {
      now: 999,
      toAssetUrl: (p) => `converted://${p}`,
    })

    // Ids preserved across the board.
    expect(parsed.themes[0].id).toBe("theme-1")
    expect(parsed.presentations[0].id).toBe("pres-1")
    expect(parsed.schedules[0].id).toBe("sched-1")
    expect(parsed.mediaAssets[0].id).toBe("asset-1")

    // Media asset filePath re-pointed at the managed copy + marked managed.
    const managedPath = parsed.mediaAssets[0].filePath
    expect(managedPath.startsWith("/managed/")).toBe(true)
    expect(parsed.mediaAssets[0].managed).toBe(true)

    // Theme background: mediaAssetId preserved (id-stable), imageUrl re-baked.
    expect(parsed.themes[0].background.mediaAssetId).toBe("asset-1")
    expect(parsed.themes[0].background.imageUrl).toBe(`converted://${managedPath}`)

    // Slide background re-baked too.
    expect(parsed.presentations[0].slides[0].background.imageUrl).toBe(
      `converted://${managedPath}`
    )

    // Schedule media item's cached path re-pointed.
    const item = parsed.schedules[0].items[0]
    if (item.type === "media") {
      expect(item.cachedFilePath).toBe(managedPath)
      expect(item.mediaAssetId).toBe("asset-1")
    } else throw new Error("expected media item")
  })

  it("leaves references untouched when bytes are absent from the archive", () => {
    const content = scenario()
    const { manifest } = buildBackup(content, 1)
    const parsed = parseBackup(manifest, [], {
      now: 1,
      toAssetUrl: (p) => p,
    })
    // filePath keeps the original source path (no managed copy to point at).
    expect(parsed.mediaAssets[0].filePath).toBe("C:\\media\\bg.png")
    // Theme still restores.
    expect(parsed.themes).toHaveLength(1)
  })

  it("rejects a non-backup manifest", () => {
    expect(() =>
      parseBackup({ format: "nope" }, [], { now: 0, toAssetUrl: (p) => p })
    ).toThrow(BackupParseError)
  })

  it("rejects a newer backup version", () => {
    const { manifest } = buildBackup(scenario(), 1)
    expect(() =>
      parseBackup({ ...manifest, version: 999 }, [], { now: 0, toAssetUrl: (p) => p })
    ).toThrow(BackupParseError)
  })
})
