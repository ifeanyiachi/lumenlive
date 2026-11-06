import { describe, expect, it } from "vitest"
import { stepInterfaceScale } from "./interface-appearance"

describe("interface zoom shortcuts", () => {
  it("steps through the supported sizes and stops at the limits", () => {
    expect(stepInterfaceScale(100, -1)).toBe(90)
    expect(stepInterfaceScale(110, 1)).toBe(125)
    expect(stepInterfaceScale(80, -1)).toBe(80)
    expect(stepInterfaceScale(200, 1)).toBe(200)
    expect(stepInterfaceScale(0, -1)).toBe(90)
  })
})
