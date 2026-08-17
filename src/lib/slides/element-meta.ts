import type { SlideElement, SlideTransitionType } from "@/types/slide"

/**
 * Human-readable label for a slide element, shown in the editor's layer list.
 * Text elements show their first 30 characters; scripture shows its reference;
 * shapes name their specific shape; everything else uses a fixed noun. Kept as
 * pure logic (no JSX) so it can live in `lib/` and be unit-tested; the matching
 * icon lives with the layer components since it returns React nodes.
 */
export function elementLabel(el: SlideElement): string {
  const elType = el.type ?? "text"
  switch (elType) {
    case "image":
      return "Image"
    case "scripture":
      return el.type === "scripture" ? el.reference || "Scripture" : "Scripture"
    case "shape":
      return el.type === "shape"
        ? el.shapeType === "circle"
          ? "Circle"
          : el.shapeType === "rounded-rect"
            ? "Rounded Rect"
            : "Rectangle"
        : "Shape"
    case "video":
      return "Video"
    default:
      return el.type === "text"
        ? el.text.slice(0, 30) || "Empty text"
        : "Element"
  }
}

/**
 * Short labels for the per-slide transition dropdown. `"cut"` is the implicit
 * default (no transition object); the rest map to {@link SlideTransitionType}.
 */
export const TRANSITION_LABELS: Record<SlideTransitionType | "cut", string> = {
  cut: "Cut",
  fade: "Fade",
  dissolve: "Dissolve",
  "push-left": "Push L",
  "push-right": "Push R",
  "wipe-left": "Wipe L",
  "wipe-right": "Wipe R",
}
