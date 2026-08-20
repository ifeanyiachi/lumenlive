import type { SlideBackground, SlideElement } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"

/**
 * Pure constructors for the type-first theme model (themeredo.md).
 *
 * `id`/`now` are injected (never `crypto.randomUUID()`/`Date.now()` inline) so
 * these stay deterministic and testable — the same convention as the rest of the
 * `lib/` layer (see `song-to-slides.ts`, `preview-slide.ts`).
 */

/** Standard authoring resolution for the unified slide/theme path. */
export const DEFAULT_THEME_RESOLUTION = { width: 1920, height: 1080 } as const

const DEFAULT_BACKGROUND: SlideBackground = { type: "solid", color: "#1a1a2e" }

export interface CreateThemeInput {
  name: string
  type: ThemeType
  background?: SlideBackground
  elements?: SlideElement[]
  builtin?: boolean
  pinned?: boolean
  resolution?: { width: number; height: number }
}

/**
 * Build a {@link Theme} from its authored parts. Callers are responsible for the
 * placeholders their type requires — pass them in `elements`, or seed a builder
 * from `lib/theme/templates/` (Phase 3). Validate with `validateTheme` before
 * persisting.
 */
export function createTheme(
  input: CreateThemeInput,
  newId: () => string,
  now = 0
): Theme {
  return {
    id: newId(),
    name: input.name,
    type: input.type,
    builtin: input.builtin ?? false,
    pinned: input.pinned ?? false,
    createdAt: now,
    updatedAt: now,
    resolution: input.resolution ?? { ...DEFAULT_THEME_RESOLUTION },
    background: input.background ?? { ...DEFAULT_BACKGROUND },
    elements: input.elements ?? [],
  }
}

/**
 * Return a copy of `theme` with `patch` applied and `updatedAt` bumped to `now`.
 * Identity fields (`id`, `type`, `builtin`, `createdAt`) are never patchable —
 * a theme's type is intrinsic and cannot change after creation.
 */
export function updateTheme(
  theme: Theme,
  patch: Partial<
    Pick<
      Theme,
      | "name"
      | "pinned"
      | "background"
      | "elements"
      | "transition"
      | "resolution"
    >
  >,
  now = 0
): Theme {
  return { ...theme, ...patch, updatedAt: now }
}
