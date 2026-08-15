import { describe, expect, it } from "vitest"
import {
  shouldSendTransparentNdi,
  type NdiKeyEligibilityInput,
} from "./ndi-key"

const base: NdiKeyEligibilityInput = {
  alphaMode: "straightAlpha",
  blackout: false,
  showLogo: false,
  clearForeground: false,
  mode: "verse",
  backgroundType: "transparent",
  hasOpaqueBaseTheme: false,
  hasMediaLayer: false,
}

describe("shouldSendTransparentNdi", () => {
  it("keys a transparent verse over its own theme", () => {
    expect(shouldSendTransparentNdi(base)).toBe(true)
  })

  it("keys a transparent slide", () => {
    expect(shouldSendTransparentNdi({ ...base, mode: "slide" })).toBe(true)
  })

  it("never keys when alpha mode is opaque", () => {
    expect(shouldSendTransparentNdi({ ...base, alphaMode: "noneOpaque" })).toBe(
      false
    )
  })

  it("does not key an opaque background", () => {
    expect(shouldSendTransparentNdi({ ...base, backgroundType: "solid" })).toBe(
      false
    )
    expect(
      shouldSendTransparentNdi({
        ...base,
        mode: "slide",
        backgroundType: "gradient",
      })
    ).toBe(false)
  })

  it("never keys media mode", () => {
    expect(
      shouldSendTransparentNdi({
        ...base,
        mode: "media",
        backgroundType: undefined,
      })
    ).toBe(false)
  })

  it("does not key when an opaque base theme sits behind the verse", () => {
    expect(
      shouldSendTransparentNdi({ ...base, hasOpaqueBaseTheme: true })
    ).toBe(false)
  })

  it("does not key when a media layer is behind the content", () => {
    expect(shouldSendTransparentNdi({ ...base, hasMediaLayer: true })).toBe(
      false
    )
  })

  it.each([
    ["blackout", { blackout: true }],
    ["logo", { showLogo: true }],
    ["clear", { clearForeground: true }],
  ] as const)("does not key during a %s hold", (_label, override) => {
    expect(shouldSendTransparentNdi({ ...base, ...override })).toBe(false)
  })
})
