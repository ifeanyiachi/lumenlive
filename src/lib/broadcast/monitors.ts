/**
 * Pure domain rules over the connected monitors.
 *
 * These hold no state and touch no Tauri APIs — they encode "given the displays
 * we can see, which one is the operator's own screen", so the broadcast settings
 * UI can decide whether display output is safe to open. Kept out of the
 * component so the rule (and its edge cases) is unit-tested in isolation.
 */

import type { MonitorFingerprint } from "@/types/broadcast"

/**
 * Minimal structural shape of a monitor we depend on — just its top-left origin
 * on the virtual desktop. Matches (a subset of) Tauri's `Monitor`, but declared
 * locally so this module stays free of `@tauri-apps` imports.
 */
export interface MonitorLike {
  position: { x: number; y: number }
}

/**
 * Index of the monitor hosting the operator's control window — the display at
 * the virtual-desktop origin (0,0), which on Windows is the primary screen the
 * app launches on. When no monitor sits at the origin (an unusual multi-display
 * arrangement, or an empty list), we fall back to index 0.
 *
 * Display output must never fullscreen over this screen: on a single-monitor
 * rig it would cover the operator's controls, so the settings UI blocks display
 * output onto it and the operator runs from the in-app preview (+ NDI). This
 * mirrors how EasyWorship / ProPresenter behave when only the operator's screen
 * is connected.
 */
export function operatorScreenIndex(monitors: MonitorLike[]): number {
  const idx = monitors.findIndex(
    (m) => m.position.x === 0 && m.position.y === 0
  )
  return idx >= 0 ? idx : 0
}

/**
 * The monitor a freshly enabled output should default to: the first display
 * that is NOT the operator's control screen, so a stage/program window "just
 * works" on a connected projector without covering the operator's workspace.
 * Falls back to the operator screen (index 0) when only one display is present —
 * callers still guard single-monitor display output, but a valid index is always
 * returned so nothing opens on an out-of-range monitor.
 */
export function preferredOutputMonitor(monitors: MonitorLike[]): number {
  const operator = operatorScreenIndex(monitors)
  const external = monitors.findIndex((_m, i) => i !== operator)
  return external >= 0 ? external : operator
}

/**
 * A monitor with the extra fields the settings dropdown labels with. A superset
 * of {@link MonitorLike}, still declared locally to avoid `@tauri-apps` imports.
 */
export interface LabeledMonitor extends MonitorLike {
  name?: string | null
  size: { width: number; height: number }
}

/**
 * Index of the primary display — the one at the virtual-desktop origin (0,0). The
 * control window almost always lives here, so the dropdown flags it. Unlike
 * {@link operatorScreenIndex}, returns `-1` when no monitor sits at the origin
 * (the label simply isn't shown) rather than falling back to 0.
 */
export function primaryMonitorIndex(monitors: MonitorLike[]): number {
  return monitors.findIndex((m) => m.position.x === 0 && m.position.y === 0)
}

/** The dropdown label for a monitor: "Name (W×H)", tagged when it's primary. */
export function monitorLabel(
  monitor: LabeledMonitor,
  index: number,
  primaryIndex: number
): string {
  const name = monitor.name ?? `Display ${index + 1}`
  const primary = index === primaryIndex ? " — Primary (this screen)" : ""
  return `${name} (${monitor.size.width}×${monitor.size.height})${primary}`
}

/** Capture a durable fingerprint of a monitor for later re-identification. */
export function monitorFingerprint(monitor: LabeledMonitor): MonitorFingerprint {
  return {
    name: monitor.name ?? null,
    position: { x: monitor.position.x, y: monitor.position.y },
    size: { width: monitor.size.width, height: monitor.size.height },
  }
}

/**
 * Whether a monitor `name` is a stable *identity* (an EDID-derived model like
 * "Optoma HD27") rather than a *positional slot* the OS reassigns by connection
 * order. On Windows, Tauri surfaces GDI device paths — `\\.\DISPLAY1`,
 * `\\.\DISPLAY2` — which track the slot, not the panel: unplug/replug can move a
 * projector to a different `DISPLAYn`, so matching on it would reattach to the
 * wrong physical display. We treat those as NON-identifying and let geometry
 * decide instead. (macOS/other platforms hand back real product names, which
 * remain trustworthy.)
 */
function isIdentifyingName(name: string | null): boolean {
  if (name == null) return false
  // GDI slot paths: \\.\DISPLAY1, \\.\DISPLAY2, … (any leading-backslash form).
  return !/^\\+\.\\DISPLAY\d+$/i.test(name)
}

// Fingerprint field weights. No single field is stable across a replug (a name
// can be a positional slot, an origin can shift, a size is shared by many
// panels), so we score all three and take the strongest match.
const NAME_WEIGHT = 4
const ORIGIN_WEIGHT = 2
const SIZE_WEIGHT = 1

/**
 * The minimum match score at which a fingerprint is considered to have *found its
 * physical display*. Size alone (SIZE_WEIGHT) is deliberately below this bar:
 * countless monitors share 1920×1080, so a resolution match is not identity —
 * treating it as one would let an output silently open on an unrelated screen
 * (fail-safe rule 3). Presence therefore requires at least an *identifying* name
 * or a matching desktop position.
 */
const MIN_PRESENT_SCORE = ORIGIN_WEIGHT

/** Score one live monitor against a target fingerprint (see the field weights). */
function scoreMonitorMatch(
  target: MonitorFingerprint,
  m: LabeledMonitor
): number {
  let score = 0
  if (
    isIdentifyingName(target.name) &&
    m.name != null &&
    m.name === target.name &&
    isIdentifyingName(m.name)
  )
    score += NAME_WEIGHT
  if (m.position.x === target.position.x && m.position.y === target.position.y)
    score += ORIGIN_WEIGHT
  if (m.size.width === target.size.width && m.size.height === target.size.height)
    score += SIZE_WEIGHT
  return score
}

/** Strongest-scoring live monitor for a fingerprint; `index: -1` when none match. */
function bestMonitorMatch(
  target: MonitorFingerprint,
  monitors: LabeledMonitor[]
): { index: number; score: number } {
  let index = -1
  let score = 0
  monitors.forEach((m, i) => {
    const s = scoreMonitorMatch(target, m)
    if (s > score) {
      score = s
      index = i
    }
  })
  return { index, score }
}

/**
 * Resolve a stored monitor fingerprint to the index of the best-matching live
 * monitor, or `-1` when nothing matches at all.
 *
 * An *identifying* name match dominates (weight 4), then origin (2), then size
 * (1). Because name (4) outranks origin+size (3), the correctly-named display
 * wins even if it came back at a new position; when the name is unhelpful —
 * absent, or a positional slot like `\\.\DISPLAY2` (see {@link isIdentifyingName})
 * — geometry reattaches it. Ties keep the earliest monitor. This is the lenient
 * "best guess" used for labelling/overlap; {@link resolveOutputMonitor} applies a
 * stricter presence bar before it will open an output there.
 */
export function resolveMonitorIndex(
  target: MonitorFingerprint,
  monitors: LabeledMonitor[]
): number {
  return bestMonitorMatch(target, monitors).index
}

/**
 * Outcome of resolving an output's saved monitor selection against the live
 * displays. Either we found the display to open on, or the output was assigned to
 * a *specific* display that isn't currently connected.
 */
export type OutputMonitorResolution =
  | { kind: "resolved"; index: number }
  | { kind: "absent" }

/**
 * Resolve an output's saved monitor selection to a concrete live display, being
 * *honest when the assigned display is missing* (fail-safe rule 3: never silently
 * grab a different screen).
 *
 * - A stored `target` fingerprint is a deliberate assignment to one physical
 *   display. If it no longer matches any live monitor, we report `absent` — the
 *   caller should hold and wait / prompt, NOT retarget. The legacy index is
 *   considered stale in this case and ignored.
 * - With no durable fingerprint (a fresh output, or one saved before fingerprints
 *   existed) there is no specific assignment to honour, so we degrade gracefully:
 *   legacy `fallbackIndex` if still in range, else the preferred external monitor.
 * - An empty monitor list is always `absent` (nothing to open on).
 */
export function resolveOutputMonitor(
  target: MonitorFingerprint | undefined,
  fallbackIndex: number | undefined,
  monitors: LabeledMonitor[]
): OutputMonitorResolution {
  if (monitors.length === 0) return { kind: "absent" }
  if (target) {
    // Require a match stronger than a shared resolution (MIN_PRESENT_SCORE):
    // otherwise the assigned display is treated as gone and we hold, rather than
    // opening on some unrelated monitor that merely has the same size.
    const match = bestMonitorMatch(target, monitors)
    return match.score >= MIN_PRESENT_SCORE
      ? { kind: "resolved", index: match.index }
      : { kind: "absent" }
  }
  if (
    fallbackIndex != null &&
    fallbackIndex >= 0 &&
    fallbackIndex < monitors.length
  ) {
    return { kind: "resolved", index: fallbackIndex }
  }
  return { kind: "resolved", index: preferredOutputMonitor(monitors) }
}

/**
 * The concrete monitor index to open an output on, degrading gracefully and
 * *always* returning a valid index. A thin wrapper over {@link resolveOutputMonitor}
 * for callers that just need a best-effort index (e.g. the operator-overlap guard);
 * the activation path uses {@link resolveOutputMonitor} directly so it can hold
 * instead of retargeting when the assigned display is `absent`.
 */
export function resolveOutputMonitorIndex(
  target: MonitorFingerprint | undefined,
  fallbackIndex: number | undefined,
  monitors: LabeledMonitor[]
): number {
  const r = resolveOutputMonitor(target, fallbackIndex, monitors)
  return r.kind === "resolved" ? r.index : preferredOutputMonitor(monitors)
}
