import { SlideElementProperties } from "@/components/slides/slide-element-properties"
import { SlideImageProperties } from "@/components/slides/slide-image-properties"
import { SlideScriptureProperties } from "@/components/slides/slide-scripture-properties"
import { SlideShapeProperties } from "@/components/slides/slide-shape-properties"
import { SlideVideoProperties } from "@/components/slides/slide-video-properties"
import type {
  SlideElement,
  SlideImageElement,
  SlideScriptureElement,
  SlideShapeElement,
  SlideVideoElement,
  SlideTextElement,
} from "@/types/slide"

/** Routes a selected element to its type-specific properties panel. */
export function ElementPropertiesRouter({
  element,
}: {
  element: SlideElement
}) {
  const elType = element.type ?? "text"
  switch (elType) {
    case "image":
      return <SlideImageProperties element={element as SlideImageElement} />
    case "scripture":
      return (
        <SlideScriptureProperties element={element as SlideScriptureElement} />
      )
    case "shape":
      return <SlideShapeProperties element={element as SlideShapeElement} />
    case "video":
      return <SlideVideoProperties element={element as SlideVideoElement} />
    default:
      return <SlideElementProperties element={element as SlideTextElement} />
  }
}
