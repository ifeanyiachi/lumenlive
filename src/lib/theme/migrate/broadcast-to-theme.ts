import type {
  BroadcastTheme,
  ThemeCategory,
  ThemeElement,
} from "@/types/broadcast"
import type { TextStyle } from "@/types/canvas"
import type {
  SlideElement,
  SlideImageElement,
  SlideScriptureElement,
  SlideShapeElement,
  SlideTextElement,
  SlideTimerElement,
  SlideTransition,
  SlideTransitionType,
} from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import { backgroundToSlide } from "./background"

/**
 * One-time migrator: an authored {@link BroadcastTheme} → the type-first
 * {@link Theme} model (themeredo.md, Phase 5). This is the `BroadcastTheme →
 * Theme` bridge whose absence gated the live scripture/countdown flips (Phase 4c-
 * live / 4d-live): with it, a legacy verse/countdown theme becomes a styled slide
 * whose verse *region* is a typed placeholder the live content flows into.
 *
 * Fidelity is *structural*, not pixel-parity: the migrated theme preserves the
 * identity, background, decorative elements, and typography without data loss, so
 * nothing an operator authored is dropped. Byte-identical live *rendering* is a
 * separate concern already proven by the Phase 4 payload parity gates — the live
 * flips consume that, not this.
 *
 * The migrated theme **keeps the source `id`** (Phase 5c — the namespace merge):
 * a stored `themeId` reference (an output, the base background, a countdown) must
 * still resolve once the new store is the single source of truth, so a custom's
 * id has to survive migration. (Element ids are already stable on the source.)
 *
 * PURE: `now` is injected (no `Date.now()` inline); no shared mutable structure
 * with the input. Mirrors the `lib/theme/model` constructors.
 */

/** Map a legacy {@link ThemeCategory} to the intrinsic {@link ThemeType}. */
export function categoryToType(category: ThemeCategory | undefined): ThemeType {
  switch (category) {
    case "song":
      return "song"
    case "countdown":
      return "countdown"
    case "sermon":
      return "sermon"
    case "overlay":
      return "overlay"
    case "scripture":
      return "scripture"
    // "general" is removed in the type-first model, and an absent category is the
    // legacy default — both become scripture, the most common authored kind.
    default:
      return "scripture"
  }
}

/** Percent-space box a placeholder occupies, derived from the verse text area. */
interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Place the verse text area (`textAreaWidth`/`textAreaHeight`, already in percent)
 * within the frame per the theme's `anchor`. The verse renderer positions the
 * region by anchor + offsets; a data migration keeps the anchor placement and
 * drops the sub-pixel offsets (they don't survive the region → element model and
 * aren't consulted by the live payload path).
 */
function placeholderBox(theme: BroadcastTheme): Box {
  const width = theme.layout.textAreaWidth
  const height = theme.layout.textAreaHeight
  const anchor = theme.layout.anchor
  const left = anchor.endsWith("left")
  const right = anchor.endsWith("right")
  const top = anchor.startsWith("top")
  const bottom = anchor.startsWith("bottom")
  const x = left ? 0 : right ? 100 - width : (100 - width) / 2
  const y = top ? 0 : bottom ? 100 - height : (100 - height) / 2
  return { x, y, width, height }
}

/** Slide horizontal align from a text style, collapsing `justify` → `left`. */
function hAlign(style: TextStyle): "left" | "center" | "right" {
  const a = style.horizontalAlign
  return a === "center" || a === "right" ? a : "left"
}

function vAlign(style: TextStyle): "top" | "middle" | "bottom" {
  return style.verticalAlign ?? "middle"
}

/** Slide text-transform, collapsing `capitalize` (unsupported) → `none`. */
function transform(style: TextStyle): "none" | "uppercase" | "lowercase" {
  const t = style.textTransform
  return t === "uppercase" || t === "lowercase" ? t : "none"
}

function shadowOf(
  style: TextStyle
): SlideTextElement["shadow"] | undefined {
  if (!style.shadow) return undefined
  return {
    offsetX: style.shadow.x,
    offsetY: style.shadow.y,
    blur: style.shadow.blur,
    color: style.shadow.color,
  }
}

/** Convert a decorative broadcast element (image/shape) to its slide equivalent. */
function decorativeElement(
  el: ThemeElement,
  resolution: { width: number; height: number }
): SlideElement | null {
  // Broadcast element geometry is pixels at the theme resolution; slide elements
  // are percentages of the frame.
  const base = {
    id: el.id,
    x: (el.x / resolution.width) * 100,
    y: (el.y / resolution.height) * 100,
    width: (el.width / resolution.width) * 100,
    height: (el.height / resolution.height) * 100,
    visible: el.visible,
    locked: el.locked,
  }
  if (el.type === "image" && el.image) {
    const image: SlideImageElement = {
      ...base,
      type: "image",
      imageUrl: el.image.url,
      objectFit: el.image.fit === "stretch" ? "fill" : el.image.fit,
      opacity: el.image.opacity,
      borderRadius: el.image.borderRadius,
    }
    return image
  }
  if (el.type === "shape" && el.shape) {
    const shape: SlideShapeElement = {
      ...base,
      type: "shape",
      shapeType:
        el.shape.shapeType === "rectangle" ? "rectangle" : el.shape.shapeType,
      fillColor: el.shape.fillColor,
      strokeColor: el.shape.strokeColor,
      strokeWidth: el.shape.strokeWidth,
      opacity: el.shape.fillOpacity,
      borderRadius: el.shape.borderRadius,
      maskTargetId: el.maskTargetId,
    }
    return shape
  }
  return null
}

/** Build the scripture placeholder from the verse/reference typography. */
function scripturePlaceholder(theme: BroadcastTheme, box: Box): SlideScriptureElement {
  const vt = theme.verseText
  return {
    id: "scripture-placeholder",
    type: "scripture",
    ...box,
    reference: "",
    verseText: "",
    translation: "",
    fontFamily: vt.fontFamily,
    fontSize: vt.fontSize,
    fontWeight: vt.fontWeight,
    bold: vt.fontWeight >= 600,
    italic: vt.fontStyle === "italic",
    color: vt.color,
    horizontalAlign: hAlign(vt),
    verticalAlign: vAlign(vt),
    lineHeight: vt.lineHeight,
    referenceFontSize: theme.reference.fontSize,
    referenceColor: theme.reference.color,
    shadow: shadowOf(vt),
    // Verse-style carriers (RF1) — preserve the authored verse styling losslessly so
    // the live scripture payload can be rebuilt from the placeholder alone.
    verseNumbers: { ...theme.verseNumbers },
    referenceUppercase: theme.reference.uppercase,
    referencePosition: theme.reference.position,
    breakPerVerse: theme.layout.breakPerVerse ?? false,
    textTransform: transform(vt),
    letterSpacing: vt.letterSpacing,
    textBox: { ...theme.textBox },
  }
}

/** Build a role-tagged lyrics/title/body text placeholder from a text style. */
function textPlaceholder(
  id: string,
  role: SlideTextElement["role"],
  style: TextStyle,
  box: Box
): SlideTextElement {
  return {
    id,
    type: "text",
    ...box,
    role,
    text: "",
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    bold: style.fontWeight >= 600,
    italic: style.fontStyle === "italic",
    underline: style.textDecoration === "underline",
    color: style.color,
    letterSpacing: style.letterSpacing,
    horizontalAlign: hAlign(style),
    verticalAlign: vAlign(style),
    lineHeight: style.lineHeight,
    textTransform: transform(style),
    shadow: shadowOf(style),
  }
}

/** Build the countdown timer placeholder styled from the verse (digit) text. */
function timerPlaceholder(theme: BroadcastTheme, box: Box): SlideTimerElement {
  const vt = theme.verseText
  return {
    id: "countdown-timer",
    type: "timer",
    ...box,
    mode: "duration",
    durationSeconds: 600,
    format: "mm:ss",
    fontFamily: vt.fontFamily,
    fontSize: vt.fontSize,
    fontWeight: vt.fontWeight,
    italic: vt.fontStyle === "italic",
    color: vt.color,
    horizontalAlign: hAlign(vt),
    verticalAlign: vAlign(vt),
    shadow: shadowOf(vt),
  }
}

/**
 * The typed placeholder(s) a migrated theme of `type` requires, filling the verse
 * text area. Overlay carries no placeholder (it composites over live content);
 * announcement is unreachable from a broadcast category but handled for totality.
 */
function placeholdersFor(theme: BroadcastTheme, type: ThemeType): SlideElement[] {
  const box = placeholderBox(theme)
  switch (type) {
    case "scripture":
      return [scripturePlaceholder(theme, box)]
    case "song":
      return [textPlaceholder("lyrics-placeholder", "lyrics", theme.verseText, box)]
    case "countdown":
      return [timerPlaceholder(theme, box)]
    case "sermon":
      return [
        textPlaceholder(
          "title-placeholder",
          "title",
          theme.verseText,
          { ...box, height: box.height / 3 }
        ),
        textPlaceholder("points-placeholder", "points", theme.verseText, {
          ...box,
          y: box.y + box.height / 3,
          height: (box.height * 2) / 3,
        }),
      ]
    case "announcement":
      return [
        textPlaceholder(
          "title-placeholder",
          "title",
          theme.verseText,
          { ...box, height: box.height / 3 }
        ),
        textPlaceholder("body-placeholder", "body", theme.verseText, {
          ...box,
          y: box.y + box.height / 3,
          height: (box.height * 2) / 3,
        }),
      ]
    case "overlay":
      return []
  }
}

const TRANSITION_MAP: Record<
  BroadcastTheme["transition"]["type"],
  SlideTransitionType
> = {
  none: "cut",
  fade: "fade",
  // Slide/scale have no direct slide-model twin; map to the nearest look.
  slide: "push-left",
  scale: "dissolve",
}

function transitionOf(theme: BroadcastTheme): SlideTransition | undefined {
  const t = theme.transition
  if (!t || t.type === "none") return undefined
  const mapped = TRANSITION_MAP[t.type]
  const dir = t.direction
  const type: SlideTransitionType =
    t.type === "slide"
      ? dir === "right"
        ? "push-right"
        : "push-left"
      : mapped
  return { type, duration: t.duration }
}

/**
 * Migrate one {@link BroadcastTheme} to a {@link Theme}. The verse region becomes
 * the type's typed placeholder; decorative image/shape elements are carried in
 * their authored layer order; the background is converted faithfully. Overlay
 * themes are forced transparent so they composite over live content.
 */
export function broadcastToTheme(bt: BroadcastTheme, now = 0): Theme {
  const type = categoryToType(bt.category)

  // Decorative elements in the theme's authored back-to-front layer order (the
  // verse renderer draws `layerOrder` reversed; a slide draws elements in array
  // order, so the array IS front-to-back — reverse the back-to-front order).
  const byId = new Map(bt.elements.map((e) => [e.id, e]))
  const ordered =
    bt.layerOrder.length > 0
      ? bt.layerOrder
          .map((id) => byId.get(id))
          .filter((e): e is ThemeElement => e != null)
      : bt.elements
  const decorations = ordered
    .map((e) => decorativeElement(e, bt.resolution))
    .filter((e): e is SlideElement => e != null)

  const placeholders = placeholdersFor(bt, type)

  const background =
    type === "overlay"
      ? { type: "transparent" as const }
      : backgroundToSlide(bt.background)

  return {
    id: bt.id,
    name: bt.name,
    type,
    builtin: false,
    pinned: bt.pinned,
    createdAt: bt.createdAt,
    updatedAt: now,
    resolution: { ...bt.resolution },
    background,
    // Decorations sit behind the content placeholder (matching the verse
    // renderer, where fixed text regions draw last / on top).
    elements: [...decorations, ...placeholders],
    transition: transitionOf(bt),
  }
}
