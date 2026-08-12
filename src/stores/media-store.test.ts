import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaAsset } from "@/types/media"

// The store persists via tauri-plugin-store; stub it out so importing the
// module doesn't reach for a real backend.
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    save: vi.fn(),
  })),
}))

// importPaths delegates path→asset conversion to the shared media-import
// pipeline; mock it so tests stay pure and don't touch the filesystem/dialog.
const pathsToAssets = vi.fn()
vi.mock("@/lib/media-import", () => ({
  pathsToAssets: (...args: unknown[]) => pathsToAssets(...args),
}))

import { useMediaStore } from "./media-store"

function asset(over: Partial<MediaAsset> & { filePath: string }): MediaAsset {
  return {
    id: crypto.randomUUID(),
    name: over.filePath.split(/[\\/]/).pop() ?? over.filePath,
    type: "image",
    fileSize: 0,
    tags: [],
    addedAt: 0,
    ...over,
  }
}

beforeEach(() => {
  pathsToAssets.mockReset()
  useMediaStore.setState({ assets: [] })
})

describe("mergeAssets", () => {
  it("appends assets whose file path isn't already present", () => {
    useMediaStore.setState({ assets: [asset({ filePath: "/a.png" })] })

    const added = useMediaStore
      .getState()
      .mergeAssets([asset({ filePath: "/b.png" })])

    expect(added).toHaveLength(1)
    expect(useMediaStore.getState().assets.map((a) => a.filePath)).toEqual([
      "/a.png",
      "/b.png",
    ])
  })

  it("skips assets whose file path already exists (dedup)", () => {
    useMediaStore.setState({ assets: [asset({ filePath: "/a.png" })] })

    const added = useMediaStore
      .getState()
      .mergeAssets([
        asset({ filePath: "/a.png" }),
        asset({ filePath: "/c.png" }),
      ])

    expect(added.map((a) => a.filePath)).toEqual(["/c.png"])
    expect(useMediaStore.getState().assets).toHaveLength(2)
  })

  it("returns an empty array and leaves state untouched when all are dupes", () => {
    const existing = asset({ filePath: "/a.png" })
    useMediaStore.setState({ assets: [existing] })

    const added = useMediaStore.getState().mergeAssets([existing])

    expect(added).toHaveLength(0)
    expect(useMediaStore.getState().assets).toEqual([existing])
  })
})

describe("importPaths", () => {
  it("converts only unknown paths and appends the resulting assets", async () => {
    useMediaStore.setState({ assets: [asset({ filePath: "/have.png" })] })
    pathsToAssets.mockResolvedValue([asset({ filePath: "/new.png" })])

    const created = await useMediaStore
      .getState()
      .importPaths(["/have.png", "/new.png"])

    // Already-present path filtered out before conversion.
    expect(pathsToAssets).toHaveBeenCalledWith(["/new.png"])
    expect(created.map((a) => a.filePath)).toEqual(["/new.png"])
    expect(useMediaStore.getState().assets).toHaveLength(2)
  })

  it("is a no-op (no conversion) when every path is already in the library", async () => {
    useMediaStore.setState({ assets: [asset({ filePath: "/have.png" })] })

    const created = await useMediaStore.getState().importPaths(["/have.png"])

    expect(pathsToAssets).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
    expect(useMediaStore.getState().assets).toHaveLength(1)
  })
})
