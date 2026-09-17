import { describe, it, expect } from "vitest"
import type { StageLayout } from "@/types/stage-layout"
import type { Background } from "@/types/canvas"
import { collectStageLayoutRefs, rewriteStageLayout } from "./stage-refs"

const assetUrl = (p: string) =>
  `http://asset.localhost/${encodeURIComponent(p)}`

function bg(): Background {
  return {
    type: "solid",
    color: "#000",
    gradient: null,
    image: null,
    video: null,
  }
}

function layout(over: Partial<StageLayout>): StageLayout {
  return {
    id: "l1",
    name: "L",
    builtin: false,
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: { width: 1920, height: 1080 },
    background: bg(),
    displayMode: "custom",
    zones: [],
    elements: [],
    layerOrder: [],
    ...over,
  }
}

describe("collectStageLayoutRefs", () => {
  it("collects a video background and image element paths", () => {
    const l = layout({
      background: {
        ...bg(),
        type: "video",
        video: {
          url: assetUrl("C:\\m\\clip.mp4"),
          fit: "cover",
          brightness: 1,
        },
      },
      elements: [
        {
          type: "image",
          id: "e1",
          name: "img",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          visible: true,
          locked: false,
          image: {
            url: assetUrl("C:\\m\\pic.png"),
            fit: "cover",
            opacity: 1,
            borderRadius: 0,
          },
        },
        {
          type: "shape",
          id: "e2",
          name: "box",
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          visible: true,
          locked: false,
          shape: {
            shapeType: "rectangle",
            fillColor: "#fff",
            fillOpacity: 1,
            strokeColor: "#000",
            strokeWidth: 0,
            borderRadius: 0,
          },
        },
      ],
    })
    expect(collectStageLayoutRefs(l).localPaths.sort()).toEqual([
      "C:\\m\\clip.mp4",
      "C:\\m\\pic.png",
    ])
  })

  it("ignores non-local urls (data/remote)", () => {
    const l = layout({
      background: {
        ...bg(),
        type: "image",
        image: {
          url: "https://example.com/x.png",
          fit: "cover",
          blur: 0,
          brightness: 1,
          tint: null,
        },
      },
    })
    expect(collectStageLayoutRefs(l).localPaths).toEqual([])
  })
})

describe("rewriteStageLayout", () => {
  it("re-points packaged paths and leaves the rest untouched", () => {
    const l = layout({
      background: {
        ...bg(),
        type: "image",
        image: {
          url: assetUrl("C:\\m\\bg.png"),
          fit: "cover",
          blur: 0,
          brightness: 1,
          tint: null,
        },
      },
    })
    const pathRemap = new Map([["C:\\m\\bg.png", "/managed/bg.png"]])
    const out = rewriteStageLayout(l, {
      pathRemap,
      toAssetUrl: (p) => `conv://${p}`,
    })
    expect(out.background.image?.url).toBe("conv:///managed/bg.png")
    // Original is untouched (pure).
    expect(l.background.image?.url).toBe(assetUrl("C:\\m\\bg.png"))
  })
})
