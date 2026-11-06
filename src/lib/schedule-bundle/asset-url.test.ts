import { describe, it, expect } from "vitest"
import { extractLocalPath, isLocalAssetUrl } from "./asset-url"

describe("extractLocalPath", () => {
  it("inverts a Windows http://asset.localhost URL", () => {
    // convertFileSrc("C:\\Users\\me\\clip.mp4") on Windows
    const url = "http://asset.localhost/C%3A%5CUsers%5Cme%5Cclip.mp4"
    expect(extractLocalPath(url)).toBe("C:\\Users\\me\\clip.mp4")
  })

  it("inverts a Windows https://asset.localhost URL", () => {
    const url = "https://asset.localhost/C%3A%5Cmedia%5Cbg.png"
    expect(extractLocalPath(url)).toBe("C:\\media\\bg.png")
  })

  it("inverts a macOS/Linux asset://localhost URL", () => {
    const url = "asset://localhost/%2FUsers%2Fme%2FPictures%2Fbg.jpg"
    expect(extractLocalPath(url)).toBe("/Users/me/Pictures/bg.jpg")
  })

  it("handles a forward-slash Windows path", () => {
    const url = "http://asset.localhost/D%3A/clips/intro.mp4"
    expect(extractLocalPath(url)).toBe("D:/clips/intro.mp4")
  })

  it("strips a trailing query/hash the webview may append", () => {
    const url = "http://asset.localhost/C%3A%5Ca%5Cb.png?v=2"
    expect(extractLocalPath(url)).toBe("C:\\a\\b.png")
  })

  it("returns null for data URLs (already self-contained)", () => {
    expect(extractLocalPath("data:image/png;base64,AAAA")).toBeNull()
  })

  it("returns null for remote http(s) URLs", () => {
    expect(extractLocalPath("https://example.com/pic.png")).toBeNull()
    expect(extractLocalPath("http://cdn.site/pic.png")).toBeNull()
  })

  it("returns null for blob URLs, empty, null, and relative names", () => {
    expect(extractLocalPath("blob:abc")).toBeNull()
    expect(extractLocalPath("")).toBeNull()
    expect(extractLocalPath(undefined)).toBeNull()
    expect(extractLocalPath("logo.png")).toBeNull()
  })

  it("returns null for an asset URL that decodes to a relative value", () => {
    // Not an absolute path — nothing we can package.
    expect(extractLocalPath("asset://localhost/just-a-name.png")).toBeNull()
  })
})

describe("isLocalAssetUrl", () => {
  it("mirrors extractLocalPath's decision", () => {
    expect(isLocalAssetUrl("http://asset.localhost/C%3A%5Ca.png")).toBe(true)
    expect(isLocalAssetUrl("data:image/png;base64,AA")).toBe(false)
    expect(isLocalAssetUrl("https://example.com/a.png")).toBe(false)
  })
})
