import type { Slide } from "@/types/slide"

/**
 * The idle output slide: a plain opaque-black frame with no elements.
 *
 * Emitted whenever nothing is live — broadcast enabled but nothing pushed, or
 * live with nothing on any layer. The audience/NDI output holds blank black until
 * the operator pushes content, matching how live-production software sits on black
 * before go-live instead of leaking the output theme's authored backdrop and
 * sample text ("John 3:16", a sermon title, …) onto the screen the moment an
 * output is opened.
 *
 * Deliberately OPAQUE black (not transparent): a transparent idle slide would
 * composit the base theme / media layer back in through the slide renderer's
 * transparent path — re-showing the very backdrop we want hidden. The base theme
 * is still delivered separately (the `base-theme` event) so the operator's
 * explicit *Clear* action can reveal it. Idle and Clear are now distinct:
 * idle = black, Clear = the configured backdrop.
 *
 * PURE: `newId`/`now` are injected for determinism (matching `themeToSlide`).
 */
export function idleBlankSlide(newId: () => string, now = 0): Slide {
  return {
    id: newId(),
    name: "Blank",
    background: { type: "solid", color: "#000000" },
    elements: [],
    transition: undefined,
    createdAt: now,
    updatedAt: now,
  }
}
