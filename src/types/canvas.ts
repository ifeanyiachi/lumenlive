// Shared canvas primitives used by both the broadcast Theme designer and the
// Stage Layout designer. These are the "spine" both preset libraries hang off:
// a positioned box, a background, and a text style. Pure type definitions — no
// React / Zustand / Tauri. Keeping them here (rather than in broadcast.ts) lets
// the stage side reuse the exact vocabulary without importing theme-only types.

export type TextHorizontalAlign = "left" | "center" | "right" | "justify"
export type TextVerticalAlign = "top" | "middle" | "bottom"
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize"
export type TextDecoration = "none" | "underline" | "line-through"

export interface Shadow {
  color: string
  blur: number
  x: number
  y: number
}

export interface Outline {
  color: string
  width: number
}

/**
 * The nine-way (here seven — no mid-row sides) anchor a box pins to when the
 * output reflows to a different aspect ratio. Mirrors the content-block
 * `layout.anchor` vocabulary and the shared `AnchorPicker`.
 */
export type CanvasAnchor =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"

/** Whether a box's size scales with the surface or stays at authored pixels. */
export type CanvasSizeMode = "proportional" | "fixed"

/**
 * A positioned, resizable rectangle on the 1920×1080 design canvas, in absolute
 * pixel coordinates. This is the shared base shape for a theme `ThemeElement`
 * and a stage `StageZone` — both are draggable/resizable boxes; they differ only
 * in what they render (decorative layer vs. live data source).
 */
export interface CanvasBox {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  locked: boolean
  /**
   * Which point the box pins to when the output reflows to another aspect ratio
   * (native-reflow output only; the editor is fixed at 1920×1080). Missing = derived
   * from the box's authored position, so pre-existing themes need no migration.
   */
  anchor?: CanvasAnchor
  /** Size behavior on reflow. Missing = `"proportional"`. */
  sizeMode?: CanvasSizeMode
}

/** Shared text-styling shape (font, colour, alignment, shadow/outline). */
export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle?: "normal" | "italic"
  color: string
  horizontalAlign?: TextHorizontalAlign
  verticalAlign?: TextVerticalAlign
  textTransform?: TextTransform
  textDecoration?: TextDecoration
  lineHeight: number
  letterSpacing: number
  shadow: Shadow | null
  outline: Outline | null
}

/** A canvas background — solid / gradient / image / video / transparent. */
export interface Background {
  type: "solid" | "gradient" | "image" | "video" | "transparent"
  color: string
  gradient: {
    type: "linear" | "radial"
    angle: number
    stops: { color: string; position: number }[]
  } | null
  image: {
    url: string
    fit: "cover" | "contain" | "stretch"
    blur: number
    brightness: number
    tint: string | null
  } | null
  video: {
    url: string
    fit: "cover" | "contain" | "stretch"
    brightness: number
  } | null
}
