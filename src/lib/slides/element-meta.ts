import type { SlideElement, SlideTransitionType } from "@/types/slide"

type Translate = (key: string) => string

/**
 * Human-readable label for a slide element, shown in the editor's layer list.
 * Text elements show their first 30 characters; scripture shows its reference;
 * shapes name their specific shape; everything else uses a fixed noun. Kept as
 * pure logic (no JSX) so it can live in `lib/` and be unit-tested; the matching
 * icon lives with the layer components since it returns React nodes.
 */
export function elementLabel(el: SlideElement, t: Translate): string {
  const elType = el.type ?? "text"
  switch (elType) {
    case "image":
      return t("layer.element.image")
    case "scripture":
      return el.type === "scripture"
        ? el.reference || t("layer.element.scripture")
        : t("layer.element.scripture")
    case "shape":
      return el.type === "shape"
        ? el.shapeType === "circle"
          ? t("layer.element.circle")
          : el.shapeType === "rounded-rect"
            ? t("layer.element.roundedRect")
            : t("layer.element.rectangle")
        : t("layer.element.shape")
    case "video":
      return t("layer.element.video")
    case "timer":
      return t("layer.element.timer")
    default:
      return el.type === "text"
        ? el.text.slice(0, 30) || t("layer.element.emptyText")
        : t("layer.element.default")
  }
}

/**
 * Short labels for the per-slide transition dropdown. `"cut"` is the implicit
 * default (no transition object); the rest map to {@link SlideTransitionType}.
 */
export const TRANSITION_LABEL_KEYS: Record<
  SlideTransitionType | "cut",
  string
> = {
  cut: "slideThumb.transitionOptions.cut",
  fade: "slideThumb.transitionOptions.fade",
  dissolve: "slideThumb.transitionOptions.dissolve",
  "push-left": "slideThumb.transitionOptions.pushLeft",
  "push-right": "slideThumb.transitionOptions.pushRight",
  "wipe-left": "slideThumb.transitionOptions.wipeLeft",
  "wipe-right": "slideThumb.transitionOptions.wipeRight",
}
