import { describe, it, expect } from "vitest"
import {
  loopRequested,
  hasTrimBoundary,
  nativeLoopEnabled,
  type MediaLoopConfig,
} from "./loop-mode"

describe("loop-mode", () => {
  describe("loopRequested", () => {
    it("is false for null/undefined/empty config", () => {
      expect(loopRequested(null)).toBe(false)
      expect(loopRequested(undefined)).toBe(false)
      expect(loopRequested({})).toBe(false)
    })

    it("is true when the loop switch is on", () => {
      expect(loopRequested({ loop: true })).toBe(true)
    })

    it("is true when the end-action dropdown is 'loop'", () => {
      expect(loopRequested({ endAction: "loop" })).toBe(true)
    })

    it("is false for other end actions", () => {
      expect(loopRequested({ endAction: "hold" })).toBe(false)
      expect(loopRequested({ endAction: "stop" })).toBe(false)
      expect(loopRequested({ endAction: "next" })).toBe(false)
    })
  })

  describe("hasTrimBoundary", () => {
    it("is false with no trims (or a zero in-point)", () => {
      expect(hasTrimBoundary({})).toBe(false)
      expect(hasTrimBoundary({ trimStart: 0 })).toBe(false)
      expect(hasTrimBoundary({ trimStart: 0, trimEnd: null })).toBe(false)
    })

    it("is true with an in-point", () => {
      expect(hasTrimBoundary({ trimStart: 2 })).toBe(true)
    })

    it("is true with an out-point", () => {
      expect(hasTrimBoundary({ trimEnd: 10 })).toBe(true)
    })
  })

  describe("nativeLoopEnabled", () => {
    it("is true for an untrimmed clip set to loop (switch or dropdown)", () => {
      expect(nativeLoopEnabled({ loop: true })).toBe(true)
      expect(nativeLoopEnabled({ endAction: "loop" })).toBe(true)
    })

    it("is false when looping is not requested", () => {
      expect(nativeLoopEnabled({})).toBe(false)
      expect(nativeLoopEnabled({ endAction: "hold" })).toBe(false)
    })

    it("is false for a trimmed loop (manual path must return to trimStart)", () => {
      const trimmedIn: MediaLoopConfig = { loop: true, trimStart: 3 }
      const trimmedOut: MediaLoopConfig = { loop: true, trimEnd: 20 }
      expect(nativeLoopEnabled(trimmedIn)).toBe(false)
      expect(nativeLoopEnabled(trimmedOut)).toBe(false)
    })
  })
})
