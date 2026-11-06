import type { OutputDisplayMode } from "@/types/broadcast"
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "@/lib/canvas-constants"

/**
 * The "surface" is the pixel dimensions the output canvas is actually rendered
 * at. Historically this was always 1920×1080 and CSS letterboxed it onto the
 * monitor; native reflow instead renders at the real output size so content lays
 * out for the true aspect ratio (see screenim.md).
 *
 * A single output window can be asked to be three different surfaces — an NDI
 * feed, a fixed custom canvas, or the live monitor — so this module is the ONE
 * place that decides which wins, and how the on-screen preview is fitted. Keeping
 * it pure (no DOM, no Tauri) makes the precedence unit-testable, which matters
 * because getting it wrong distorts a live broadcast.
 */

export interface Surface {
  width: number
  height: number
}

/** Which input decided the surface — also drives the on-screen `object-fit`. */
export type SurfaceSource = "ndi" | "custom" | "native" | "fallback"

export interface ResolvedSurface extends Surface {
  source: SurfaceSource
}

export interface ResolveSurfaceInput {
  /** The output's configured display mode. Missing = `"native"`. */
  displayMode?: OutputDisplayMode
  /** The output window's real inner size in device pixels (native mode). */
  window?: Surface | null
  /** The authored custom resolution (custom mode). */
  custom?: Surface | null
  /** The active NDI session resolution, or null when NDI is inactive. */
  ndi?: Surface | null
}

const isPositive = (s: Surface | null | undefined): s is Surface =>
  !!s && s.width > 0 && s.height > 0

/**
 * Decide the backing-store size for an output frame.
 *
 * Precedence (screenim.md §7.3): **NDI active → NDI resolution** wins so the feed
 * is never distorted; then a `custom` output uses its authored resolution; then
 * `native` uses the real window size; otherwise fall back to the 1920×1080 design
 * size (e.g. a hidden window before its size is known).
 */
export function resolveSurface(input: ResolveSurfaceInput): ResolvedSurface {
  if (isPositive(input.ndi)) {
    return { width: input.ndi.width, height: input.ndi.height, source: "ndi" }
  }
  if (input.displayMode === "custom" && isPositive(input.custom)) {
    return {
      width: input.custom.width,
      height: input.custom.height,
      source: "custom",
    }
  }
  if (isPositive(input.window)) {
    return {
      width: input.window.width,
      height: input.window.height,
      source: "native",
    }
  }
  return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT, source: "fallback" }
}

/**
 * The CSS `object-fit` for the on-screen preview canvas, given how the surface
 * was resolved:
 * - `native` — the backing store already equals the window, so `fill` is a crisp
 *   1:1 map (no letterbox, no distortion).
 * - `custom` — the authored canvas may not match the monitor; `customFit`
 *   (default `contain`/letterbox) preserves it.
 * - `ndi` — the confidence monitor shows exactly the feed, letterboxed → WYSIWYG.
 * - `fallback` — safe letterbox.
 */
export function resolvePreviewObjectFit(
  source: SurfaceSource,
  customFit: "contain" | "cover" | undefined
): "fill" | "contain" | "cover" {
  switch (source) {
    case "native":
      return "fill"
    case "custom":
      return customFit ?? "contain"
    case "ndi":
    case "fallback":
    default:
      return "contain"
  }
}
