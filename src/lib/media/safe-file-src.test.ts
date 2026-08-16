import { describe, it, expect, vi, beforeEach } from "vitest"
import { safeFileSrc } from "./safe-file-src"

const convertFileSrcMock = vi.fn()
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => convertFileSrcMock(path),
}))

describe("safeFileSrc", () => {
  beforeEach(() => {
    convertFileSrcMock.mockReset()
  })

  it("returns the converted asset URL when conversion succeeds", () => {
    convertFileSrcMock.mockReturnValue("asset://localhost/C/media/clip.mp4")
    expect(safeFileSrc("C:/media/clip.mp4")).toBe(
      "asset://localhost/C/media/clip.mp4"
    )
    expect(convertFileSrcMock).toHaveBeenCalledWith("C:/media/clip.mp4")
  })

  it("falls back to the raw path when conversion throws (e.g. no Tauri context)", () => {
    convertFileSrcMock.mockImplementation(() => {
      throw new Error("not in a Tauri context")
    })
    // Never rejects/throws — callers embed the result directly in src/url.
    expect(safeFileSrc("C:/media/clip.mp4")).toBe("C:/media/clip.mp4")
  })

  it("passes an already-remote/converted URL through the same path", () => {
    convertFileSrcMock.mockReturnValue("https://cdn.example/x.png")
    expect(safeFileSrc("https://cdn.example/x.png")).toBe(
      "https://cdn.example/x.png"
    )
  })
})
