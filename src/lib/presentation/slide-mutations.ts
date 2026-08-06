import type { Presentation, Slide, SlideElement } from "@/types/slide"

/**
 * Pure slide- and element-level transforms for the presentation editor.
 *
 * Every function returns a new value and never touches zustand, IPC, or clocks
 * of its own — timestamps (`now`) and ids (`newId`) are injected so the logic is
 * deterministic and unit-testable. The store supplies `Date.now()` and
 * `crypto.randomUUID` at the call site and layers on selection bookkeeping.
 */

// ── Element-array transforms ────────────────────────────────────────────────
// These operate on a slide's `elements` array. A `null` return means "no-op",
// letting the store leave state untouched exactly as before.

/** Move an element from `fromIndex` to `toIndex`. */
export function reorderElements(
  elements: SlideElement[],
  fromIndex: number,
  toIndex: number
): SlideElement[] {
  // Out-of-range indices would splice `undefined` into the array; treat as a no-op.
  if (
    fromIndex < 0 ||
    fromIndex >= elements.length ||
    toIndex < 0 ||
    toIndex >= elements.length
  ) {
    return elements
  }
  const next = [...elements]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/** Move an element to the end (top of the visual stack), or `null` if already there / missing. */
export function moveElementToTop(
  elements: SlideElement[],
  id: string
): SlideElement[] | null {
  const idx = elements.findIndex((e) => e.id === id)
  if (idx < 0 || idx === elements.length - 1) return null
  const next = [...elements]
  const [moved] = next.splice(idx, 1)
  next.push(moved)
  return next
}

/** Move an element to the front (bottom of the stack), or `null` if already there / missing. */
export function moveElementToBottom(
  elements: SlideElement[],
  id: string
): SlideElement[] | null {
  const idx = elements.findIndex((e) => e.id === id)
  if (idx <= 0) return null
  const next = [...elements]
  const [moved] = next.splice(idx, 1)
  next.unshift(moved)
  return next
}

/** Swap an element one step toward the top, or `null` if already there / missing. */
export function moveElementUp(
  elements: SlideElement[],
  id: string
): SlideElement[] | null {
  const idx = elements.findIndex((e) => e.id === id)
  if (idx < 0 || idx === elements.length - 1) return null
  const next = [...elements]
  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
  return next
}

/** Swap an element one step toward the bottom, or `null` if already there / missing. */
export function moveElementDown(
  elements: SlideElement[],
  id: string
): SlideElement[] | null {
  const idx = elements.findIndex((e) => e.id === id)
  if (idx <= 0) return null
  const next = [...elements]
  ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
  return next
}

/** Remove every element whose id is in `ids`. */
export function removeElements(
  elements: SlideElement[],
  ids: string[]
): SlideElement[] {
  return elements.filter((e) => !ids.includes(e.id))
}

/** Apply `updates` to every element whose id is in `ids`. */
export function updateElements(
  elements: SlideElement[],
  ids: string[],
  updates: Partial<SlideElement>
): SlideElement[] {
  return elements.map((e) =>
    ids.includes(e.id) ? ({ ...e, ...updates } as SlideElement) : e
  )
}

/**
 * Apply per-element `updates` in a single pass. Used by drag/resize where each
 * selected element gets a *different* patch — batching them into one array walk
 * (and one presentation rebuild at the call site) instead of one rebuild per
 * element per pointer event.
 */
export function updateElementsById(
  elements: SlideElement[],
  updatesById: Map<string, Partial<SlideElement>>
): SlideElement[] {
  if (updatesById.size === 0) return elements
  return elements.map((e) => {
    const u = updatesById.get(e.id)
    return u ? ({ ...e, ...u } as SlideElement) : e
  })
}

// ── Presentation/slide transforms ───────────────────────────────────────────

/**
 * Patch the slide at `index` with `updates` and bump the presentation's
 * `updatedAt`. The slide's own `updatedAt` is intentionally left untouched
 * (matching the historical `updateActiveSlide` helper).
 */
export function updateSlideAt(
  draft: Presentation,
  index: number,
  updates: Partial<Slide>,
  now: number
): Presentation {
  return {
    ...draft,
    updatedAt: now,
    slides: draft.slides.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    ),
  }
}

/**
 * Patch a single element on the slide at `index`. Unlike {@link updateSlideAt},
 * this also bumps the target slide's `updatedAt`, preserving the original
 * `updateDraftElement` behaviour.
 */
export function updateElementOnSlide(
  draft: Presentation,
  index: number,
  elementId: string,
  updates: Partial<SlideElement>,
  now: number
): Presentation {
  const slide = draft.slides[index]
  if (!slide) return draft
  const updatedSlide: Slide = {
    ...slide,
    updatedAt: now,
    elements: slide.elements.map((e) =>
      e.id === elementId ? ({ ...e, ...updates } as SlideElement) : e
    ),
  }
  return {
    ...draft,
    updatedAt: now,
    slides: draft.slides.map((sl, i) => (i === index ? updatedSlide : sl)),
  }
}

/** Append `element` to the slide at `index`. */
export function appendElementToSlide(
  draft: Presentation,
  index: number,
  element: SlideElement,
  now: number
): Presentation {
  return updateSlideAt(
    draft,
    index,
    {
      elements: [...(draft.slides[index]?.elements ?? []), element],
    },
    now
  )
}

/** Append a slide to the deck. */
export function appendSlide(
  draft: Presentation,
  slide: Slide,
  now: number
): Presentation {
  return { ...draft, updatedAt: now, slides: [...draft.slides, slide] }
}

/** Remove the slide at `index` (caller guards the "last slide" case). */
export function removeSlideAt(
  draft: Presentation,
  index: number,
  now: number
): Presentation {
  return {
    ...draft,
    updatedAt: now,
    slides: draft.slides.filter((_, i) => i !== index),
  }
}

/**
 * Duplicate the slide at `index`, inserting the copy right after it with fresh
 * ids for the slide and each element. Returns `null` when `index` is out of range.
 */
export function duplicateSlideAt(
  draft: Presentation,
  index: number,
  newId: () => string,
  now: number
): Presentation | null {
  const original = draft.slides[index]
  if (!original) return null
  // Deep-clone so the duplicate shares no nested objects (background gradient
  // stops, element shadow/outline/animation) with the source slide.
  const dup: Slide = {
    ...structuredClone(original),
    id: newId(),
    elements: original.elements.map((e) => ({
      ...structuredClone(e),
      id: newId(),
    })),
    createdAt: now,
    updatedAt: now,
  }
  const slides = [...draft.slides]
  slides.splice(index + 1, 0, dup)
  return { ...draft, updatedAt: now, slides }
}

/** Move a slide from `fromIndex` to `toIndex`. */
export function reorderSlideAt(
  draft: Presentation,
  fromIndex: number,
  toIndex: number,
  now: number
): Presentation {
  // Out-of-range indices would splice `undefined` into the deck; treat as a no-op.
  if (
    fromIndex < 0 ||
    fromIndex >= draft.slides.length ||
    toIndex < 0 ||
    toIndex >= draft.slides.length
  ) {
    return draft
  }
  const slides = [...draft.slides]
  const [moved] = slides.splice(fromIndex, 1)
  slides.splice(toIndex, 0, moved)
  return { ...draft, updatedAt: now, slides }
}
