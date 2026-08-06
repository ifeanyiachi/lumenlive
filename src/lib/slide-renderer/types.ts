import type { ElementAnimationState } from "@/lib/slide-animation"

/** Shared media caches passed through the slide-rendering pipeline. */
export interface SlideRenderCaches {
  imageCache?: Map<string, HTMLImageElement>
  videoCache?: Map<string, HTMLVideoElement>
}

/** Per-frame rendering options (animation, text build-in, animation clock). */
export interface SlideRenderOptions {
  animationStates?: Map<string, ElementAnimationState>
  textBuildProgress?: Map<string, number>
  /**
   * Monotonic frame clock in milliseconds (e.g. `performance.now()`), consumed
   * by time-driven backgrounds. Surfaces that want animated backgrounds to move
   * must pass this on every RAF tick; omitting it renders a static frame at t=0.
   */
  frameTime?: number
}
