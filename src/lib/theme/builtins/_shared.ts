import type {
  SlideScriptureElement,
  SlideShapeElement,
  SlideTextElement,
  SlideTimerElement,
  TextPlaceholderRole,
} from "@/types/slide"

/**
 * Element factories for the built-in theme catalog (themeredo.md, Phase 1).
 *
 * Built-in themes are deterministic code constants: element ids are stable
 * strings (not minted), so snapshots stay reproducible and there is no reliance
 * on `crypto.randomUUID()`. Each factory fills the full element shape from
 * sensible defaults; callers override only what the look needs.
 */

type Rect = { x: number; y: number; width: number; height: number }

export function textEl(
  id: string,
  rect: Rect,
  overrides: Partial<SlideTextElement> = {}
): SlideTextElement {
  return {
    id,
    type: "text",
    text: "",
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: "#ffffff",
    letterSpacing: 0,
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.4,
    textTransform: "none",
    ...rect,
    ...overrides,
  }
}

/** A text element that carries a placeholder `role`. */
export function placeholderTextEl(
  id: string,
  role: TextPlaceholderRole,
  rect: Rect,
  overrides: Partial<SlideTextElement> = {}
): SlideTextElement {
  return textEl(id, rect, { ...overrides, role })
}

export function scriptureEl(
  id: string,
  rect: Rect,
  overrides: Partial<SlideScriptureElement> = {}
): SlideScriptureElement {
  return {
    id,
    type: "scripture",
    reference: "",
    verseText: "",
    translation: "",
    fontFamily: "Inter",
    fontSize: 40,
    fontWeight: 400,
    bold: false,
    italic: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.5,
    referenceFontSize: 24,
    referenceColor: "#cccccc",
    ...rect,
    ...overrides,
  }
}

export function timerEl(
  id: string,
  rect: Rect,
  overrides: Partial<SlideTimerElement> = {}
): SlideTimerElement {
  return {
    id,
    type: "timer",
    mode: "duration",
    durationSeconds: 300,
    format: "mm:ss",
    fontFamily: "Inter",
    fontSize: 140,
    fontWeight: 800,
    italic: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
    ...rect,
    ...overrides,
  }
}

export function shapeEl(
  id: string,
  rect: Rect,
  overrides: Partial<SlideShapeElement> = {}
): SlideShapeElement {
  return {
    id,
    type: "shape",
    shapeType: "rounded-rect",
    fillColor: "rgba(0,0,0,0.55)",
    strokeColor: "#ffffff",
    strokeWidth: 0,
    opacity: 1,
    borderRadius: 0,
    ...rect,
    ...overrides,
  }
}
