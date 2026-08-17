import {
  ImageIcon,
  BookOpenIcon,
  SquareIcon,
  VideoIcon,
  TypeIcon,
} from "lucide-react"

import type { SlideElement } from "@/types/slide"

/**
 * Icon for a slide element's type, shown in the layer list. JSX-returning, so
 * it lives in the component layer; the pure `elementLabel`/`TRANSITION_LABELS`
 * counterparts live in `@/lib/slides/element-meta`.
 */
export function elementIcon(el: SlideElement) {
  const elType = el.type ?? "text"
  switch (elType) {
    case "image":
      return <ImageIcon className="size-3 shrink-0" />
    case "scripture":
      return <BookOpenIcon className="size-3 shrink-0" />
    case "shape":
      return <SquareIcon className="size-3 shrink-0" />
    case "video":
      return <VideoIcon className="size-3 shrink-0" />
    default:
      return <TypeIcon className="size-3 shrink-0" />
  }
}
