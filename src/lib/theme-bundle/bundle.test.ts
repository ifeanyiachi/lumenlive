import { describe, it, expect } from "vitest"
import type { MediaAsset } from "@/types/media"
import type { Theme } from "@/types/theme"
import type { StageLayout } from "@/types/stage-layout"
import type { Background } from "@/types/canvas"
import type { ExtractedMedia } from "@/types/bundle"
import {
  buildThemeBundle,
  parseThemeBundle,
  ThemeBundleParseError,
  THEME_BUNDLE_FORMAT,
} from "./bundle"

const assetUrl = (p: string) =>
  `http://asset.localhost/${encodeURIComponent(p)}`

function asset(
  id: string,
  filePath: string,
  type: MediaAsset["type"]
): MediaAsset {
  return { id, name: id, type, filePath, fileSize: 1, tags: [], addedAt: 0 }
}

function solidBackground(): Background {
  return {
    type: "solid",
    color: "#000",
    gradient: null,
    image: null,
    video: null,
  }
}

/** Simulate the Rust extractor: each packaged file lands under /managed/<zipName>. */
function extract(
  mediaFiles: { srcPath: string; zipName: string }[]
): ExtractedMedia[] {
  return mediaFiles.map((m) => ({
    zipName: m.zipName,
    path: `/managed/${m.zipName}`,
  }))
}

// ── Design theme ─────────────────────────────────────────────────────────────

function themeScenario() {
  const bgAsset = asset("a-bg", "C:\\media\\theme-bg.jpg", "image")
  const logoAsset = asset("a-logo", "C:\\media\\logo.png", "image")
  const theme: Theme = {
    id: "custom-theme-1",
    name: "My Look",
    type: "scripture",
    builtin: false,
    pinned: true,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: {
      type: "image",
      mediaAssetId: "a-bg",
      imageUrl: assetUrl(bgAsset.filePath),
    },
    elements: [
      {
        type: "image",
        id: "el-logo",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        opacity: 1,
        objectFit: "contain",
        borderRadius: 0,
        imageUrl: assetUrl(logoAsset.filePath),
      },
    ],
  }
  return { theme, mediaAssets: [bgAsset, logoAsset] }
}

describe("buildThemeBundle — design theme", () => {
  it("packages the background asset and the element image", () => {
    const { theme, mediaAssets } = themeScenario()
    const { manifest, mediaFiles, missingMedia } = buildThemeBundle(
      { kind: "theme", theme },
      { mediaAssets },
      123
    )

    expect(manifest.format).toBe(THEME_BUNDLE_FORMAT)
    expect(manifest.kind).toBe("theme")
    expect(manifest.theme?.id).toBe("custom-theme-1")
    expect(missingMedia).toBe(0)
    expect(new Set(manifest.media.map((m) => m.srcPath))).toEqual(
      new Set(["C:\\media\\theme-bg.jpg", "C:\\media\\logo.png"])
    )
    expect(mediaFiles).toHaveLength(2)
  })

  it("counts a referenced asset whose source file is missing", () => {
    const { theme } = themeScenario()
    // No media assets available → the background's mediaAssetId can't resolve,
    // but its baked imageUrl still packages the file. The element image URL also
    // packages. So nothing is missing here; drop the URL to force a miss.
    const stripped: Theme = {
      ...theme,
      background: { type: "image", mediaAssetId: "gone" },
      elements: [],
    }
    const { missingMedia, manifest } = buildThemeBundle(
      { kind: "theme", theme: stripped },
      { mediaAssets: [] },
      1
    )
    expect(missingMedia).toBe(1)
    expect(manifest.media).toHaveLength(0)
  })
})

describe("parseThemeBundle — design theme", () => {
  it("round-trips with a fresh id and every reference re-pointed", () => {
    const { theme, mediaAssets } = themeScenario()
    const { manifest, mediaFiles } = buildThemeBundle(
      { kind: "theme", theme },
      { mediaAssets },
      1
    )

    let n = 0
    const parsed = parseThemeBundle(manifest, extract(mediaFiles), {
      newId: () => `nid-${n++}`,
      now: 999,
      toAssetUrl: (p) => `converted://${p}`,
    })

    expect(parsed.kind).toBe("theme")
    const t = parsed.theme!
    expect(t.id).not.toBe("custom-theme-1")
    expect(t.builtin).toBe(false)
    expect(t.pinned).toBe(false)
    expect(t.createdAt).toBe(999)

    // Only the background is asset-backed (has a mediaAssetId); the element logo
    // is referenced by a baked URL, so it's packaged and re-baked but creates no
    // library record.
    expect(parsed.mediaAssets).toHaveLength(1)
    const bgAsset = parsed.mediaAssets[0]
    expect(bgAsset.managed).toBe(true)
    expect(bgAsset.filePath.startsWith("/managed/")).toBe(true)

    // Background: mediaAssetId re-pointed, imageUrl re-baked from managed path.
    expect(t.background.mediaAssetId).toBe(bgAsset.id)
    expect(t.background.imageUrl).toBe(`converted://${bgAsset.filePath}`)

    // Element image re-baked too.
    const el = t.elements[0]
    if (el.type === "image") {
      expect(el.imageUrl?.startsWith("converted:///managed/")).toBe(true)
    } else throw new Error("expected image element")
  })
})

// ── Stage layout ─────────────────────────────────────────────────────────────

function stageScenario() {
  const layout: StageLayout = {
    id: "layout-1",
    name: "Confidence",
    builtin: false,
    pinned: true,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: {
      ...solidBackground(),
      type: "image",
      image: {
        url: assetUrl("C:\\media\\stage-bg.jpg"),
        fit: "cover",
        blur: 0,
        brightness: 1,
        tint: null,
      },
    },
    displayMode: "custom",
    zones: [],
    elements: [
      {
        type: "image",
        id: "el-1",
        name: "Logo",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        visible: true,
        locked: false,
        image: {
          url: assetUrl("C:\\media\\stage-logo.png"),
          fit: "contain",
          opacity: 1,
          borderRadius: 0,
        },
      },
    ],
    layerOrder: ["el-1"],
  }
  return { layout }
}

describe("stage-layout bundle", () => {
  it("packages background + element images with no asset records", () => {
    const { layout } = stageScenario()
    const { manifest, missingMedia } = buildThemeBundle(
      { kind: "stage-layout", stageLayout: layout },
      { mediaAssets: [] },
      1
    )
    expect(manifest.kind).toBe("stage-layout")
    expect(missingMedia).toBe(0)
    expect(new Set(manifest.media.map((m) => m.srcPath))).toEqual(
      new Set(["C:\\media\\stage-bg.jpg", "C:\\media\\stage-logo.png"])
    )
    // Stage layouts carry no mediaAssetId, so nothing is asset-backed.
    expect(manifest.media.every((m) => !m.asset)).toBe(true)
  })

  it("round-trips with a fresh id and re-baked urls", () => {
    const { layout } = stageScenario()
    const { manifest, mediaFiles } = buildThemeBundle(
      { kind: "stage-layout", stageLayout: layout },
      { mediaAssets: [] },
      1
    )
    let n = 0
    const parsed = parseThemeBundle(manifest, extract(mediaFiles), {
      newId: () => `nid-${n++}`,
      now: 5,
      toAssetUrl: (p) => `converted://${p}`,
    })

    expect(parsed.kind).toBe("stage-layout")
    const l = parsed.stageLayout!
    expect(l.id).not.toBe("layout-1")
    expect(l.builtin).toBe(false)
    expect(l.pinned).toBe(false)
    // No managed asset records for a stage layout.
    expect(parsed.mediaAssets).toHaveLength(0)
    // Background + element urls re-baked from managed paths.
    expect(l.background.image?.url.startsWith("converted:///managed/")).toBe(
      true
    )
    const el = l.elements[0]
    if (el.type === "image") {
      expect(el.image?.url.startsWith("converted:///managed/")).toBe(true)
    } else throw new Error("expected image element")
  })
})

// ── Validation ───────────────────────────────────────────────────────────────

describe("parseThemeBundle — validation", () => {
  it("rejects a non-theme-bundle manifest", () => {
    expect(() =>
      parseThemeBundle({ format: "something-else" }, [], {
        newId: () => "x",
        now: 0,
        toAssetUrl: (p) => p,
      })
    ).toThrow(ThemeBundleParseError)
  })

  it("rejects a newer bundle version", () => {
    const { theme, mediaAssets } = themeScenario()
    const { manifest } = buildThemeBundle(
      { kind: "theme", theme },
      { mediaAssets },
      1
    )
    expect(() =>
      parseThemeBundle({ ...manifest, version: 999 }, [], {
        newId: () => "x",
        now: 0,
        toAssetUrl: (p) => p,
      })
    ).toThrow(ThemeBundleParseError)
  })
})
