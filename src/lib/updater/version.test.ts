import { describe, expect, it } from "vitest"
import {
  compareVersions,
  isVersionAtLeast,
  shouldNotifyUpdate,
  type AvailableUpdate,
} from "./version"

const update: AvailableUpdate = { version: "1.4.0", notes: "notes" }

describe("shouldNotifyUpdate", () => {
  it("hides the notice when no update is available", () => {
    expect(shouldNotifyUpdate(null, null)).toBe(false)
    expect(shouldNotifyUpdate(null, "1.3.0")).toBe(false)
  })

  it("shows the notice for a fresh, never-dismissed update", () => {
    expect(shouldNotifyUpdate(update, null)).toBe(true)
  })

  it("hides the notice for the exact version already dismissed", () => {
    expect(shouldNotifyUpdate(update, "1.4.0")).toBe(false)
  })

  it("re-surfaces when a newer version ships after a dismissal", () => {
    expect(shouldNotifyUpdate(update, "1.3.0")).toBe(true)
    expect(shouldNotifyUpdate({ version: "1.5.0", notes: "" }, "1.4.0")).toBe(
      true
    )
  })
})

describe("version comparison", () => {
  it("compares release versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareVersions("0.5.2", "0.5.2")).toBe(0)
    expect(compareVersions("0.5.1", "0.5.2")).toBeLessThan(0)
  })

  it("orders prereleases before their final release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.1")).toBeGreaterThan(0)
  })

  it("determines whether the running build satisfies a minimum", () => {
    expect(isVersionAtLeast("0.6.0", "0.6.0")).toBe(true)
    expect(isVersionAtLeast("0.7.0", "0.6.0")).toBe(true)
    expect(isVersionAtLeast("0.5.9", "0.6.0")).toBe(false)
  })
})
