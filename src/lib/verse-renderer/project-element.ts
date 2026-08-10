/**
 * Theme-element-flavored aliases for the shared box projection. Kept so verse
 * rendering and the element inspector import familiar names; the generic
 * implementation (also used by stage zones) lives in `lib/canvas-box-projection`.
 */
export {
  projectBoxToSurface as projectElementToSurface,
  deriveBoxAnchor as deriveElementAnchor,
} from "@/lib/canvas-box-projection"
