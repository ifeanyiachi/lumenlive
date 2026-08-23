import { describe, it, expect } from "vitest"
import type {
  SlideBackground,
  SlideImageElement,
  SlideVideoElement,
} from "@/types/slide"
import {
  collectSurfaceRefs,
  rewriteSurface,
  type MediaSurface,
  type RewriteContext,
} from "./media-refs"

const WIN = (p: string) =>
  `http://asset.localhost/${encodeURIComponent(p)}`

function imageEl(imageUrl: string): SlideImageElement {
  return {
    id: "img-el",
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    imageUrl,
    objectFit: "cover",
    opacity: 1,
    borderRadius: 0,
  }
}

function videoEl(videoUrl: string): SlideVideoElement {
  return {
    id: "vid-el",
    type: "video",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    videoUrl,
    objectFit: "cover",
    opacity: 1,
    borderRadius: 0,
    muted: true,
    loop: true,
  }
}

describe("collectSurfaceRefs", () => {
  it("collects background asset id + local paths from bg and elements", () => {
    const bg: SlideBackground = {
      type: "image",
      mediaAssetId: "asset-1",
      imageUrl: WIN("C:\\bg.png"),
    }
    const surface: MediaSurface = {
      background: bg,
      elements: [imageEl(WIN("C:\\el.png")), videoEl(WIN("C:\\clip.mp4"))],
    }
    const refs = collectSurfaceRefs(surface)
    expect(refs.assetIds).toEqual(["asset-1"])
    expect(refs.localPaths).toEqual(["C:\\bg.png", "C:\\el.png", "C:\\clip.mp4"])
  })

  it("ignores data/remote urls and solid backgrounds", () => {
    const surface: MediaSurface = {
      background: { type: "solid", color: "#000" },
      elements: [
        imageEl("data:image/png;base64,AA"),
        imageEl("https://example.com/x.png"),
      ],
    }
    const refs = collectSurfaceRefs(surface)
    expect(refs.assetIds).toEqual([])
    expect(refs.localPaths).toEqual([])
  })
})

describe("rewriteSurface", () => {
  const ctx: RewriteContext = {
    assetIdRemap: new Map([["asset-1", "asset-NEW"]]),
    pathRemap: new Map([
      ["C:\\bg.png", "/managed/bg.png"],
      ["C:\\el.png", "/managed/el.png"],
    ]),
    toAssetUrl: (p) => `converted://${p}`,
  }

  it("remaps the background asset id and rewrites its url", () => {
    const surface: MediaSurface = {
      background: {
        type: "image",
        mediaAssetId: "asset-1",
        imageUrl: WIN("C:\\bg.png"),
      },
      elements: [],
    }
    const out = rewriteSurface(surface, ctx)
    expect(out.background.mediaAssetId).toBe("asset-NEW")
    expect(out.background.imageUrl).toBe("converted:///managed/bg.png")
  })

  it("rewrites element urls that were packaged, leaves others alone", () => {
    const surface: MediaSurface = {
      background: { type: "solid", color: "#000" },
      elements: [
        imageEl(WIN("C:\\el.png")), // packaged → rewritten
        imageEl(WIN("C:\\missing.png")), // not in pathRemap → unchanged
        imageEl("data:image/png;base64,AA"), // self-contained → unchanged
      ],
    }
    const out = rewriteSurface(surface, ctx)
    const urls = out.elements.map((e) =>
      e.type === "image" ? e.imageUrl : ""
    )
    expect(urls[0]).toBe("converted:///managed/el.png")
    expect(urls[1]).toBe(WIN("C:\\missing.png"))
    expect(urls[2]).toBe("data:image/png;base64,AA")
  })

  it("does not mutate the input surface", () => {
    const bg: SlideBackground = {
      type: "image",
      mediaAssetId: "asset-1",
      imageUrl: WIN("C:\\bg.png"),
    }
    const surface: MediaSurface = { background: bg, elements: [] }
    rewriteSurface(surface, ctx)
    expect(bg.mediaAssetId).toBe("asset-1")
    expect(bg.imageUrl).toBe(WIN("C:\\bg.png"))
  })
})
