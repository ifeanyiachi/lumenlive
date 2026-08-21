import { describe, expect, it } from "vitest"
import { shouldNotifyUpdate, type AvailableUpdate } from "./version"

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
