import { describe, it, expect, vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => {
    if (path === "THROW") throw new Error("no tauri")
    return `asset://localhost/${path}`
  },
}))

import { safeFileSrc } from "./safe-file-src"

describe("safeFileSrc", () => {
  it("returns the converted asset URL on success", () => {
    expect(safeFileSrc("C:/media/clip.mp4")).toBe(
      "asset://localhost/C:/media/clip.mp4"
    )
  })

  it("falls back to the raw path when conversion throws", () => {
    expect(safeFileSrc("THROW")).toBe("THROW")
  })
})
