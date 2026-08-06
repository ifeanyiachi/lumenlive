// Stage Layout — the data model for a reusable, named arrangement of the stage
// / confidence monitor (the screen the pastor, band, and MC look at). A
// StageLayout is the stage-side sibling of a `BroadcastTheme`: selected per
// output, drawn on the same 1920×1080 canvas, sharing the same box / background
// / text-style vocabulary (see types/canvas.ts).
//
// The one thing unique to a stage layout that a theme cannot express is a
// **data-bound zone** — a box whose content is a live feed (clock, timer, the
// next schedule item, operator messages) rather than a decorative layer. So a
// StageLayout carries both `zones[]` (typed, live) and `elements[]` (free-form
// decorative, reused from the theme model for "Custom Template" mode).

import type { CanvasBox, Background, TextStyle } from "./canvas"
import type { ThemeElement } from "./broadcast"

/** The live data source a zone renders. */
export type ZoneSource =
  | "current" // the current slide / verse being shown to the congregation
  | "next" // a preview of the next item
  | "clock" // wall clock
  | "timer" // count-up / countdown
  | "messages" // operator stage messages
  | "announcement" // announcement text
  | "playlist" // playlist / schedule info
  | "notes" // presenter notes for the current item
  | "spacer" // no content — layout/visual spacer only

/**
 * A positioned, resizable box bound to a live data `source`. Extends the shared
 * `CanvasBox` (absolute-pixel geometry) with stage-specific fields.
 */
export interface StageZone extends CanvasBox {
  source: ZoneSource
  /** Optional header label drawn above the zone (e.g. "LYRICS", "NEXT"). */
  label?: string
  /** Whether to draw the zone header. Defaults to true in the renderer. */
  showHeader?: boolean
  /** Text styling for zones that render text (clock, notes, messages, …). */
  text?: TextStyle
  /** Clock/timer display format, for the relevant sources. */
  clockFormat?: "12h" | "24h"
}

/**
 * A saved stage-monitor arrangement. `displayMode` selects the authoring model:
 * "zone" constrains the palette to typed `zones`; "custom" also unlocks the
 * free-form `elements` (the full theme element set) for a bespoke design.
 */
export interface StageLayout {
  id: string
  name: string
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  background: Background
  displayMode: "zone" | "custom"
  zones: StageZone[]
  elements: ThemeElement[]
  /** z-order over the union of `zones` and `elements`, by id. */
  layerOrder: string[]
}
