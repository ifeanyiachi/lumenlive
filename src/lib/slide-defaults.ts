import type {
  Slide,
  Presentation,
  SlideTextElement,
  SlideImageElement,
  SlideScriptureElement,
  SlideVideoElement,
  SlideShapeElement,
  SlideTimerElement,
} from "@/types/slide"

export function createDefaultTextElement(): SlideTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "New text",
    x: 10,
    y: 30,
    width: 80,
    height: 40,
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
  }
}

export const createDefaultElement = createDefaultTextElement

export function createDefaultImageElement(): SlideImageElement {
  return {
    id: crypto.randomUUID(),
    type: "image",
    imageUrl: "",
    x: 20,
    y: 20,
    width: 60,
    height: 60,
    objectFit: "contain",
    opacity: 1,
    borderRadius: 0,
  }
}

export function createDefaultScriptureElement(): SlideScriptureElement {
  return {
    id: crypto.randomUUID(),
    type: "scripture",
    reference: "",
    verseText: "",
    translation: "",
    x: 10,
    y: 20,
    width: 80,
    height: 60,
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
  }
}

export function createDefaultVideoElement(): SlideVideoElement {
  return {
    id: crypto.randomUUID(),
    type: "video",
    videoUrl: "",
    x: 20,
    y: 20,
    width: 60,
    height: 40,
    objectFit: "cover",
    opacity: 1,
    borderRadius: 0,
    muted: true,
    loop: true,
  }
}

export function createDefaultShapeElement(): SlideShapeElement {
  return {
    id: crypto.randomUUID(),
    type: "shape",
    shapeType: "rounded-rect",
    x: 20,
    y: 20,
    width: 60,
    height: 40,
    fillColor: "rgba(255,255,255,0.15)",
    strokeColor: "#ffffff",
    strokeWidth: 2,
    opacity: 1,
    borderRadius: 12,
  }
}

export function createDefaultTimerElement(): SlideTimerElement {
  return {
    id: crypto.randomUUID(),
    type: "timer",
    mode: "duration",
    durationSeconds: 300,
    format: "mm:ss",
    x: 20,
    y: 35,
    width: 60,
    height: 30,
    fontFamily: "Inter",
    fontSize: 96,
    fontWeight: 700,
    italic: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
  }
}

export function createDefaultSlide(): Slide {
  return {
    id: crypto.randomUUID(),
    name: "Untitled Slide",
    background: { type: "solid", color: "#1a1a2e" },
    elements: [createDefaultTextElement()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function createDefaultPresentation(
  name = "Untitled Presentation"
): Presentation {
  return {
    id: crypto.randomUUID(),
    name,
    slides: [createDefaultSlide()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}
