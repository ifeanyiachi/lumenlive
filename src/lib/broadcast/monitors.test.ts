import { describe, it, expect } from "vitest"
import {
  operatorScreenIndex,
  preferredOutputMonitor,
  primaryMonitorIndex,
  monitorLabel,
  monitorFingerprint,
  resolveMonitorIndex,
  resolveOutputMonitor,
  resolveOutputMonitorIndex,
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

describe("monitorFingerprint", () => {
  it("captures name, position and size", () => {
    expect(monitorFingerprint(mon("Optoma HD27", 1920, 1080, 1920, 0))).toEqual(
      {
        name: "Optoma HD27",
        position: { x: 1920, y: 0 },
        size: { width: 1920, height: 1080 },
      }
    )
  })

  it("normalizes a missing name to null", () => {
    expect(monitorFingerprint(mon(null, 1280, 720)).name).toBeNull()
  })
})

describe("resolveMonitorIndex", () => {
  const laptop = mon("Built-in", 1920, 1080, 0, 0)
  const projector = mon("Optoma HD27", 1920, 1080, 1920, 0)

  it("matches the same physical display at the same spot", () => {
    const fp = monitorFingerprint(projector)
    expect(resolveMonitorIndex(fp, [laptop, projector])).toBe(1)
  })

  it("reattaches by name when the display returns at a new origin", () => {
    // Projector came back to the LEFT of the laptop → origin moved, name holds.
    const fp = monitorFingerprint(projector)
    const movedProjector = mon("Optoma HD27", 1920, 1080, -1920, 0)
    expect(resolveMonitorIndex(fp, [movedProjector, laptop])).toBe(0)
  })

  it("name (weight 4) outranks a rival matching origin+size (3)", () => {
    const fp = monitorFingerprint(projector) // name Optoma, origin 1920,0
    // Index 0 matches origin+size but wrong name; index 1 matches name only.
    const impostorAtOldSpot = mon("Generic", 1920, 1080, 1920, 0)
    const realElsewhere = mon("Optoma HD27", 1920, 1080, 3840, 0)
    expect(resolveMonitorIndex(fp, [impostorAtOldSpot, realElsewhere])).toBe(1)
  })

  it("falls back to geometry when the name is unhelpful (null)", () => {
    const fp = monitorFingerprint(mon(null, 1920, 1080, 1920, 0))
    expect(
      resolveMonitorIndex(fp, [laptop, mon(null, 1920, 1080, 1920, 0)])
    ).toBe(1)
  })

  it("ignores a matching Windows GDI slot name and uses geometry instead", () => {
    // Both displays report the SAME positional slot name (\\.\DISPLAY2 was the
    // projector's slot; a different panel now occupies it). The name must NOT
    // win — geometry (origin+size) picks the real projector at index 1.
    const fp = monitorFingerprint(mon("\\\\.\\DISPLAY2", 1920, 1080, 1920, 0))
    const impostorInOldSlot = mon("\\\\.\\DISPLAY2", 1280, 720, 0, 0)
    const realProjector = mon("\\\\.\\DISPLAY1", 1920, 1080, 1920, 0)
    expect(resolveMonitorIndex(fp, [impostorInOldSlot, realProjector])).toBe(1)
  })

  it("returns -1 when nothing matches at all", () => {
    const fp = monitorFingerprint(projector)
    const unrelated = mon("Other", 1280, 720, 500, 500)
    expect(resolveMonitorIndex(fp, [unrelated])).toBe(-1)
  })

  it("returns -1 for an empty monitor list", () => {
    expect(resolveMonitorIndex(monitorFingerprint(projector), [])).toBe(-1)
  })
})

describe("resolveOutputMonitor", () => {
  const laptop = mon("Built-in", 1920, 1080, 0, 0)
  const projector = mon("Optoma HD27", 1920, 1080, 1920, 0)

  it("resolves to the fingerprinted display when it is present", () => {
    const fp = monitorFingerprint(projector)
    expect(resolveOutputMonitor(fp, 0, [laptop, projector])).toEqual({
      kind: "resolved",
      index: 1,
    })
  })

  it("reports ABSENT (does not retarget) when the assigned display is gone", () => {
    // The whole point of fail-safe rule 3: a specific projector was assigned and
    // is unplugged — hold, don't grab the laptop. The legacy index is ignored.
    // (The laptop even shares the projector's 1920×1080 — a size-only match must
    // NOT count as presence.)
    const fp = monitorFingerprint(projector)
    expect(resolveOutputMonitor(fp, 0, [laptop])).toEqual({ kind: "absent" })
  })

  it("holds when only the resolution matches (shared 1080p is not identity)", () => {
    // A different monitor at a different position that merely shares the size.
    const fp = monitorFingerprint(projector) // origin (1920,0)
    const otherPanel = mon("Generic", 1920, 1080, -1920, 0)
    expect(resolveOutputMonitor(fp, undefined, [otherPanel])).toEqual({
      kind: "absent",
    })
  })

  it("resolves on a position match even when the name is a positional slot", () => {
    // Windows GDI case: name is a non-identifying slot, but the display is back
    // at its recorded origin (+ size) → strong enough to be present.
    const fp = monitorFingerprint(mon("\\\\.\\DISPLAY2", 1920, 1080, 1920, 0))
    const backAtOrigin = mon("\\\\.\\DISPLAY3", 1920, 1080, 1920, 0)
    expect(resolveOutputMonitor(fp, undefined, [backAtOrigin])).toEqual({
      kind: "resolved",
      index: 0,
    })
  })

  it("reports ABSENT when no monitors are connected at all", () => {
    const fp = monitorFingerprint(projector)
    expect(resolveOutputMonitor(fp, 0, [])).toEqual({ kind: "absent" })
  })

  it("degrades to the legacy index when no fingerprint was ever saved", () => {
    // Nothing to betray (pre-fingerprint output) → honour the legacy index.
    expect(resolveOutputMonitor(undefined, 0, [laptop, projector])).toEqual({
      kind: "resolved",
      index: 0,
    })
  })

  it("degrades to the preferred external monitor with no hints", () => {
    expect(
      resolveOutputMonitor(undefined, undefined, [laptop, projector])
    ).toEqual({ kind: "resolved", index: 1 })
  })
})

describe("resolveOutputMonitorIndex", () => {
  const laptop = mon("Built-in", 1920, 1080, 0, 0)
  const projector = mon("Optoma HD27", 1920, 1080, 1920, 0)

  it("prefers the fingerprint match over the legacy index", () => {
    const fp = monitorFingerprint(projector)
    // Legacy index says 0, but the fingerprint identifies index 1.
    expect(resolveOutputMonitorIndex(fp, 0, [laptop, projector])).toBe(1)
  })

  it("ignores a stale fingerprint's legacy index, using the preferred external", () => {
    // A specific display was assigned and is gone (absent) → the best-effort
    // wrapper does NOT reuse the stale legacy index (0), it prefers the external.
    const fp = monitorFingerprint(mon("Gone", 800, 600, 5000, 0))
    expect(resolveOutputMonitorIndex(fp, 0, [laptop, projector])).toBe(1)
  })

  it("ignores a legacy index that is now out of range", () => {
    // No fingerprint, index 5 invalid → preferred external (index 1).
    expect(resolveOutputMonitorIndex(undefined, 5, [laptop, projector])).toBe(1)
  })

  it("falls back to the preferred external monitor with no hints", () => {
    expect(
      resolveOutputMonitorIndex(undefined, undefined, [laptop, projector])
    ).toBe(1)
  })
})
