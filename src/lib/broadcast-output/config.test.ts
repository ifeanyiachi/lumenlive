import { describe, it, expect } from "vitest"
import { parseBroadcastConfig } from "./config"

describe("parseBroadcastConfig", () => {
  it("reads output + mode from the hash", () => {
    expect(parseBroadcastConfig("#output=alt&mode=stage")).toEqual({
      outputId: "alt",
      outputMode: "stage",
    })
  })

  it("tolerates a hash with no leading '#'", () => {
    expect(parseBroadcastConfig("output=alt&mode=stage")).toEqual({
      outputId: "alt",
      outputMode: "stage",
    })
  })

  it("defaults to main/normal when absent or empty", () => {
    expect(parseBroadcastConfig("")).toEqual({
      outputId: "main",
      outputMode: "normal",
    })
    expect(parseBroadcastConfig("#")).toEqual({
      outputId: "main",
      outputMode: "normal",
    })
    expect(parseBroadcastConfig("#mode=stage")).toEqual({
      outputId: "main",
      outputMode: "stage",
    })
  })
})
