import type { BroadcastTheme, ThemeElement } from "@/types/broadcast"

/**
 * Pure theme-editing transforms used by the broadcast Theme Designer.
 *
 * Every function takes the current draft (plus any ids/timestamps the caller
 * generates) and returns a brand-new draft — no zustand, no IPC, no clocks or
 * randomness of their own. Ids and timestamps are injected so the transforms
 * are deterministic and unit-testable; the store passes `crypto.randomUUID()`
 * and `Date.now()` at the call site.
 */

/** The three built-in regions that always exist in a theme's layer order. */
export const DEFAULT_LAYER_ORDER: string[] = ["textArea", "verse", "reference"]

/** The selection sentinels for the built-in verse/reference regions. */
export type RegionSelection = "verse" | "reference"

/**
 * Immutably set a deep value on `obj` at a dotted `path`. Numeric path segments
 * address array indices; missing containers are created as arrays or objects
 * depending on the following segment. Returns a shallow-cloned copy along the
 * mutated path, leaving the input untouched.
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split(".")
  const isIndex = (key: string) => /^\d+$/.test(key)
  const result: Record<string, unknown> = Array.isArray(obj)
    ? ([...obj] as unknown as Record<string, unknown>)
    : { ...obj }

  let current: Record<string, unknown> | unknown[] = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]
    const currentIndex = isIndex(key) ? Number(key) : key
    const existing = (current as Record<string, unknown> | unknown[])[
      currentIndex as keyof typeof current
    ]
    const nextContainer = Array.isArray(existing)
      ? [...existing]
      : existing && typeof existing === "object"
        ? { ...(existing as Record<string, unknown>) }
        : isIndex(nextKey)
          ? []
          : {}

    ;(current as Record<string, unknown> | unknown[])[
      currentIndex as keyof typeof current
    ] = nextContainer as never
    current = nextContainer as Record<string, unknown> | unknown[]
  }

  const lastKey = keys[keys.length - 1]
  const lastIndex = isIndex(lastKey) ? Number(lastKey) : lastKey
  ;(current as Record<string, unknown> | unknown[])[
    lastIndex as keyof typeof current
  ] = value as never

  return result
}

/**
 * Normalise a stored theme into an editable draft: guarantee `elements` and
 * `layerOrder` exist and stamp a fresh `updatedAt`.
 */
export function createDraft(
  theme: BroadcastTheme,
  now: number
): BroadcastTheme {
  return {
    ...theme,
    elements: theme.elements ?? [],
    layerOrder: theme.layerOrder ?? [...DEFAULT_LAYER_ORDER],
    updatedAt: now,
  }
}

/** Build a fresh image/shape element with default geometry and styling. */
export function makeElement(type: "image" | "shape", id: string): ThemeElement {
  return {
    id,
    type,
    name: type === "image" ? "Image" : "Shape",
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    visible: true,
    locked: false,
    ...(type === "image"
      ? {
          image: {
            url: "",
            fit: "cover" as const,
            opacity: 1,
            borderRadius: 0,
          },
        }
      : {
          shape: {
            shapeType: "rectangle" as const,
            fillColor: "#ffffff",
            fillOpacity: 0.8,
            strokeColor: "#000000",
            strokeWidth: 0,
            borderRadius: 0,
          },
        }),
  }
}

/** The new draft plus the element that should become selected. */
export interface ElementEdit {
  draft: BroadcastTheme
  selectedId: string
}

/** Append a new element and place it at the top of the layer order. */
export function addElement(
  draft: BroadcastTheme,
  type: "image" | "shape",
  id: string,
  now: number
): ElementEdit {
  const el = makeElement(type, id)
  const elements = [...(draft.elements ?? []), el]
  const layerOrder = [el.id, ...(draft.layerOrder ?? [...DEFAULT_LAYER_ORDER])]
  return {
    draft: { ...draft, elements, layerOrder, updatedAt: now },
    selectedId: el.id,
  }
}

/** Remove an element and drop it from the layer order. */
export function removeElement(
  draft: BroadcastTheme,
  id: string,
  now: number
): BroadcastTheme {
  const elements = (draft.elements ?? []).filter((e) => e.id !== id)
  const layerOrder = (draft.layerOrder ?? []).filter((l) => l !== id)
  return { ...draft, elements, layerOrder, updatedAt: now }
}

/** Move a layer from `fromIndex` to `toIndex` in the stacking order. */
export function reorderLayers(
  draft: BroadcastTheme,
  fromIndex: number,
  toIndex: number,
  now: number
): BroadcastTheme {
  const order = [...(draft.layerOrder ?? [...DEFAULT_LAYER_ORDER])]
  // Out-of-range indices would splice `undefined` into the layer order; no-op.
  if (
    fromIndex < 0 ||
    fromIndex >= order.length ||
    toIndex < 0 ||
    toIndex >= order.length
  ) {
    return draft
  }
  const [moved] = order.splice(fromIndex, 1)
  order.splice(toIndex, 0, moved)
  return { ...draft, layerOrder: order, updatedAt: now }
}

/**
 * Toggle an element's visibility. Mirrors the original store action, which did
 * not bump `updatedAt` for a visibility toggle.
 */
export function toggleElementVisibility(
  draft: BroadcastTheme,
  id: string
): BroadcastTheme {
  return {
    ...draft,
    elements: (draft.elements ?? []).map((e) =>
      e.id === id ? { ...e, visible: !e.visible } : e
    ),
  }
}

/**
 * Toggle an element's locked flag. Like the original action, this does not bump
 * `updatedAt`.
 */
export function toggleElementLocked(
  draft: BroadcastTheme,
  id: string
): BroadcastTheme {
  return {
    ...draft,
    elements: (draft.elements ?? []).map((e) =>
      e.id === id ? { ...e, locked: !e.locked } : e
    ),
  }
}

/**
 * Duplicate an element, offsetting it slightly and inserting the copy just
 * before the source in the layer order. Returns `null` when the source id is
 * not found.
 */
export function duplicateElement(
  draft: BroadcastTheme,
  id: string,
  newId: string,
  now: number
): ElementEdit | null {
  const source = (draft.elements ?? []).find((e) => e.id === id)
  if (!source) return null
  const newEl: ThemeElement = {
    ...structuredClone(source),
    id: newId,
    name: `${source.name} Copy`,
    x: source.x + 2,
    y: source.y + 2,
  }
  const elements = [...(draft.elements ?? []), newEl]
  const orderIdx = (draft.layerOrder ?? []).indexOf(id)
  const layerOrder = [...(draft.layerOrder ?? [])]
  layerOrder.splice(orderIdx === -1 ? 0 : orderIdx, 0, newEl.id)
  return {
    draft: { ...draft, elements, layerOrder, updatedAt: now },
    selectedId: newEl.id,
  }
}

/**
 * Nudge the current selection by (dx, dy). The built-in `verse`/`reference`
 * regions move the theme's layout offset; any other selection moves the matching
 * custom element. Returns `null` when the move is a no-op — no selection target,
 * a missing element, or a locked element — so the caller can skip history and
 * side effects, exactly as the original store did.
 */
export function nudgeSelection(
  draft: BroadcastTheme,
  selectedElement: string,
  dx: number,
  dy: number,
  now: number
): BroadcastTheme | null {
  if (selectedElement === "verse" || selectedElement === "reference") {
    const layout = draft.layout
    return {
      ...draft,
      layout: {
        ...layout,
        offsetX: layout.offsetX + dx,
        offsetY: layout.offsetY + dy,
      },
      updatedAt: now,
    }
  }
  const el = (draft.elements ?? []).find((e) => e.id === selectedElement)
  if (!el || el.locked) return null
  return {
    ...draft,
    elements: (draft.elements ?? []).map((e) =>
      e.id === selectedElement ? { ...e, x: e.x + dx, y: e.y + dy } : e
    ),
    updatedAt: now,
  }
}

/**
 * Promote a built-in draft into a saveable custom theme: fresh id, "(Custom)"
 * name, cleared `builtin` flag, and new timestamps.
 */
export function promoteBuiltinToCustom(
  draft: BroadcastTheme,
  newId: string,
  now: number
): BroadcastTheme {
  return {
    ...draft,
    id: newId,
    name: `${draft.name} (Custom)`,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
}
