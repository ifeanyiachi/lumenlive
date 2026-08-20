import { describe, expect, it } from "vitest"
import { fontPx, recordingCtx } from "./recording-ctx"

describe("recordingCtx", () => {
  it("records fillText/strokeText with the graphics state at draw time", () => {
    const { ctx, draws } = recordingCtx()
    ctx.font = "italic 600 44px Inter"
    ctx.fillStyle = "#ff0000"
    ctx.textAlign = "center"
    ctx.fillText("hello", 10, 20)
    ctx.font = "24px Inter"
    ctx.strokeText("edge", 5, 6)

    expect(draws).toHaveLength(2)
    expect(draws[0]).toMatchObject({
      kind: "fill",
      text: "hello",
      x: 10,
      y: 20,
      font: "italic 600 44px Inter",
      fillStyle: "#ff0000",
      textAlign: "center",
    })
    expect(draws[1]).toMatchObject({ kind: "stroke", text: "edge", font: "24px Inter" })
  })

  it("measureText is length-proportional and geometry calls are inert", () => {
    const { ctx } = recordingCtx()
    expect(ctx.measureText("abcd").width).toBe(40)
    // None of these throw despite no real canvas backing.
    ctx.save()
    ctx.beginPath()
    ctx.clip()
    ctx.fillRect(0, 0, 10, 10)
    const g = ctx.createLinearGradient(0, 0, 1, 1)
    g.addColorStop(0, "#000")
    ctx.restore()
  })

  it("fontPx pulls the pixel size out of a css font string", () => {
    expect(fontPx("italic 600 44px Inter")).toBe(44)
    expect(fontPx("24px sans-serif")).toBe(24)
    expect(fontPx("bold small-caps Inter")).toBeNull()
  })
})
