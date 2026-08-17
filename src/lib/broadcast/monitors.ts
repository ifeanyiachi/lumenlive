/**
 * Pure domain rules over the connected monitors.
 *
 * These hold no state and touch no Tauri APIs — they encode "given the displays
 * we can see, which one is the operator's own screen", so the broadcast settings
 * UI can decide whether display output is safe to open. Kept out of the
 * component so the rule (and its edge cases) is unit-tested in isolation.
 */

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
