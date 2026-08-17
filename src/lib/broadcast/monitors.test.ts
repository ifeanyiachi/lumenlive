import { describe, it, expect } from "vitest"
import {
  operatorScreenIndex,
  preferredOutputMonitor,
  primaryMonitorIndex,
  monitorLabel,
  type MonitorLike,
  type LabeledMonitor,
} from "./monitors"

const at = (x: number, y: number): MonitorLike => ({ position: { x, y } })

const mon = (
  name: string | null,
  width: number,
  height: number,
  x = 0,
  y = 0
): LabeledMonitor => ({ name, size: { width, height }, position: { x, y } })

describe("operatorScreenIndex", () => {
  it("returns the index of the monitor at the origin", () => {
    // Primary second in the list — the origin, not position, decides.
    expect(operatorScreenIndex([at(1920, 0), at(0, 0)])).toBe(1)
  })

  it("finds the origin monitor when it is first", () => {
    expect(operatorScreenIndex([at(0, 0), at(1920, 0)])).toBe(0)
  })

  it("falls back to index 0 when no monitor sits at the origin", () => {
    // e.g. every display is offset to the right of a virtual origin.
    expect(operatorScreenIndex([at(100, 0), at(2020, 0)])).toBe(0)
  })

  it("falls back to index 0 for an empty list", () => {
    expect(operatorScreenIndex([])).toBe(0)
  })

  it("handles a display positioned left of the origin (negative x)", () => {
    // Origin monitor is the operator's; the left display has negative x.
    expect(operatorScreenIndex([at(-1920, 0), at(0, 0)])).toBe(1)
  })

  it("only treats an exact (0,0) origin as the operator screen", () => {
    // A near-origin display (1px off) is not the operator screen → fallback.
    expect(operatorScreenIndex([at(1, 0), at(0, 1)])).toBe(0)
  })

  it("returns the first match when multiple monitors report the origin", () => {
    expect(operatorScreenIndex([at(0, 0), at(0, 0)])).toBe(0)
  })
})

describe("preferredOutputMonitor", () => {
  it("picks the first non-operator display (operator at origin, first)", () => {
    // Operator is index 0 (origin); the external display is index 1.
    expect(preferredOutputMonitor([at(0, 0), at(1920, 0)])).toBe(1)
  })

  it("skips the operator screen wherever it sits in the list", () => {
    // Operator is index 1 (origin); the first external display is index 0.
    expect(preferredOutputMonitor([at(1920, 0), at(0, 0)])).toBe(0)
  })

  it("falls back to the operator screen when only one display exists", () => {
    expect(preferredOutputMonitor([at(0, 0)])).toBe(0)
  })

  it("falls back to index 0 for an empty list", () => {
    expect(preferredOutputMonitor([])).toBe(0)
  })

  it("returns an external display across three monitors", () => {
    // Operator at origin is index 1; first non-operator is index 0.
    expect(preferredOutputMonitor([at(-1920, 0), at(0, 0), at(1920, 0)])).toBe(
      0
    )
  })
})

describe("primaryMonitorIndex", () => {
  it("returns the index of the origin monitor", () => {
    expect(primaryMonitorIndex([at(1920, 0), at(0, 0)])).toBe(1)
  })

  it("returns -1 when no monitor sits at the origin (no fallback)", () => {
    expect(primaryMonitorIndex([at(100, 0), at(2020, 0)])).toBe(-1)
  })

  it("returns -1 for an empty list", () => {
    expect(primaryMonitorIndex([])).toBe(-1)
  })
})

describe("monitorLabel", () => {
  it("formats name and resolution", () => {
    expect(monitorLabel(mon("Dell U2720", 2560, 1440), 0, 1)).toBe(
      "Dell U2720 (2560×1440)"
    )
  })

  it("tags the primary display", () => {
    expect(monitorLabel(mon("Built-in", 1920, 1080), 1, 1)).toBe(
      "Built-in (1920×1080) — Primary (this screen)"
    )
  })

  it("falls back to a numbered name when the monitor is unnamed", () => {
    expect(monitorLabel(mon(null, 1280, 720), 2, 0)).toBe(
      "Display 3 (1280×720)"
    )
  })
})
