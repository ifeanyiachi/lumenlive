// Pure stage-layout editing transforms used by the Stage Layout Designer.
//
// This is the stage-side sibling of `lib/broadcast/theme-editing.ts`: every
// function takes the current draft (plus any ids/timestamps the caller supplies)
// and returns a brand-new draft — no Zustand, no IPC, no clocks or randomness of
// their own. Ids and `now` are injected so the transforms stay deterministic and
// unit-testable; the store passes `crypto.randomUUID()` / `Date.now()`.
//
// A `StageLayout` carries two layers: typed `zones[]` (bound to live data) and
// free-form decorative `elements[]` (reused `ThemeElement`s, unlocked in Custom
// Template mode). `layerOrder` interleaves both by id.

import type { ThemeElement } from "@/types/broadcast"
import type { StageLayout, StageZone, ZoneSource } from "@/types/stage-layout"
import type { TextStyle } from "@/types/canvas"

/** Re-exported generic deep-setter (immutable, dotted path). */
export { setNestedValue } from "@/lib/broadcast/theme-editing"

const DEFAULT_ZONE_TEXT: TextStyle = {
  fontFamily: "Inter",
  fontSize: 32,
  fontWeight: 400,
  color: "#e0e0e0",
  lineHeight: 1.2,
  letterSpacing: 0,
  shadow: null,
  outline: null,
}

/** Human labels + default box geometry for each zone source. */
const ZONE_DEFAULTS: Record<
  ZoneSource,
  {
    name: string
    label?: string
    showHeader: boolean
    box: { w: number; h: number }
  }
> = {
  current: {
    name: "Lyrics",
    label: "CURRENT",
    showHeader: true,
    box: { w: 1090, h: 824 },
  },
  clock: { name: "Clock", showHeader: false, box: { w: 658, h: 216 } },
  timer: {
    name: "Timer",
    label: "TIMER",
    showHeader: true,
    box: { w: 658, h: 216 },
  },
  messages: {
    name: "Messages",
    label: "MESSAGE",
    showHeader: true,
    box: { w: 900, h: 300 },
  },
  announcement: {
    name: "Announcement",
    label: "ANNOUNCEMENT",
    showHeader: true,
    box: { w: 900, h: 300 },
  },
  playlist: {
    name: "Playlist",
    label: "PLAYLIST",
    showHeader: true,
    box: { w: 600, h: 400 },
  },
  notes: {
    name: "Notes",
    label: "NOTES",
    showHeader: true,
    box: { w: 1222, h: 216 },
  },
  spacer: { name: "Spacer", showHeader: false, box: { w: 400, h: 200 } },
}

/** Runtime set of the zone sources the app still supports (keys of ZONE_DEFAULTS). */
const VALID_ZONE_SOURCES: ReadonlySet<string> = new Set(
  Object.keys(ZONE_DEFAULTS)
)

/**
 * Drop zones whose `source` the app no longer supports (e.g. the removed "next"
 * preview) from a stored layout, keeping `layerOrder` in sync. Returns the same
 * reference when nothing needs removing, so callers can skip needless writes.
 * Runs on load so a layout saved before a source was retired stays clean rather
 * than falling through to a placeholder.
 */
export function sanitizeStageLayout(layout: StageLayout): StageLayout {
  const zones = (layout.zones ?? []).filter((z) =>
    VALID_ZONE_SOURCES.has(z.source)
  )
  if (zones.length === (layout.zones?.length ?? 0)) return layout
  const kept = new Set(zones.map((z) => z.id))
  return {
    ...layout,
    zones,
    layerOrder: (layout.layerOrder ?? []).filter(
      (id) => kept.has(id) || (layout.elements ?? []).some((e) => e.id === id)
    ),
  }
}

/**
 * Normalise a stored layout into an editable draft: guarantee `zones`,
 * `elements`, and `layerOrder` exist and stamp a fresh `updatedAt`.
 */
export function createStageDraft(
  layout: StageLayout,
  now: number
): StageLayout {
  const zones = layout.zones ?? []
  const elements = layout.elements ?? []
  const layerOrder = layout.layerOrder ?? [
    ...zones.map((z) => z.id),
    ...elements.map((e) => e.id),
  ]
  return { ...layout, zones, elements, layerOrder, updatedAt: now }
}

/** Build a fresh zone of the given source with default geometry/styling. */
export function makeZone(source: ZoneSource, id: string): StageZone {
  const d = ZONE_DEFAULTS[source]
  const zone: StageZone = {
    id,
    name: d.name,
    source,
    x: 100,
    y: 100,
    width: d.box.w,
    height: d.box.h,
    visible: true,
    locked: false,
    label: d.label,
    showHeader: d.showHeader,
    text: { ...DEFAULT_ZONE_TEXT },
  }
  if (source === "clock") zone.clockFormat = "12h"
  return zone
}

/** The new draft plus the zone that should become selected. */
export interface ZoneEdit {
  draft: StageLayout
  selectedId: string
}

/** Append a new zone and place it at the top of the layer order. */
export function addZone(
  draft: StageLayout,
  source: ZoneSource,
  id: string,
  now: number
): ZoneEdit {
  const zone = makeZone(source, id)
  const zones = [...draft.zones, zone]
  const layerOrder = [zone.id, ...draft.layerOrder]
  return {
    draft: { ...draft, zones, layerOrder, updatedAt: now },
    selectedId: zone.id,
  }
}

/** Remove a zone (or free-form element) and drop it from the layer order. */
export function removeZone(
  draft: StageLayout,
  id: string,
  now: number
): StageLayout {
  return {
    ...draft,
    zones: draft.zones.filter((z) => z.id !== id),
    elements: draft.elements.filter((e) => e.id !== id),
    layerOrder: draft.layerOrder.filter((l) => l !== id),
    updatedAt: now,
  }
}

/** Move a layer from `fromIndex` to `toIndex` in the stacking order. */
export function reorderLayers(
  draft: StageLayout,
  fromIndex: number,
  toIndex: number,
  now: number
): StageLayout {
  const order = [...draft.layerOrder]
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

/** Toggle a zone's visibility. Does not bump `updatedAt` (matches theme side). */
export function toggleZoneVisibility(
  draft: StageLayout,
  id: string
): StageLayout {
  return {
    ...draft,
    zones: draft.zones.map((z) =>
      z.id === id ? { ...z, visible: !z.visible } : z
    ),
    elements: draft.elements.map((e) =>
      e.id === id ? { ...e, visible: !e.visible } : e
    ),
  }
}

/** Toggle a zone's locked flag. Does not bump `updatedAt`. */
export function toggleZoneLocked(draft: StageLayout, id: string): StageLayout {
  return {
    ...draft,
    zones: draft.zones.map((z) =>
      z.id === id ? { ...z, locked: !z.locked } : z
    ),
    elements: draft.elements.map((e) =>
      e.id === id ? { ...e, locked: !e.locked } : e
    ),
  }
}

/**
 * Duplicate a zone, offsetting it slightly and inserting the copy just before
 * the source in the layer order. Returns `null` when the id is not found.
 */
export function duplicateZone(
  draft: StageLayout,
  id: string,
  newId: string,
  now: number
): ZoneEdit | null {
  const source = draft.zones.find((z) => z.id === id)
  if (!source) return null
  const copy: StageZone = {
    ...structuredClone(source),
    id: newId,
    name: `${source.name} Copy`,
    x: source.x + 2,
    y: source.y + 2,
  }
  const zones = [...draft.zones, copy]
  const orderIdx = draft.layerOrder.indexOf(id)
  const layerOrder = [...draft.layerOrder]
  layerOrder.splice(orderIdx === -1 ? 0 : orderIdx, 0, copy.id)
  return {
    draft: { ...draft, zones, layerOrder, updatedAt: now },
    selectedId: copy.id,
  }
}

/**
 * Nudge the selected zone or element by (dx, dy). Returns `null` when the move
 * is a no-op — no selection, a missing target, or a locked one — so the caller
 * can skip history and side effects.
 */
export function nudgeZone(
  draft: StageLayout,
  selectedId: string,
  dx: number,
  dy: number,
  now: number
): StageLayout | null {
  const zone = draft.zones.find((z) => z.id === selectedId)
  if (zone) {
    if (zone.locked) return null
    return {
      ...draft,
      zones: draft.zones.map((z) =>
        z.id === selectedId ? { ...z, x: z.x + dx, y: z.y + dy } : z
      ),
      updatedAt: now,
    }
  }
  const el = draft.elements.find((e) => e.id === selectedId)
  if (!el || el.locked) return null
  return {
    ...draft,
    elements: draft.elements.map((e) =>
      e.id === selectedId ? { ...e, x: e.x + dx, y: e.y + dy } : e
    ),
    updatedAt: now,
  }
}

/**
 * Promote a built-in draft into a saveable custom layout: fresh id, "(Custom)"
 * name, cleared `builtin` flag, new timestamps.
 */
export function promoteBuiltinToCustom(
  draft: StageLayout,
  newId: string,
  now: number
): StageLayout {
  return {
    ...draft,
    id: newId,
    name: `${draft.name} (Custom)`,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
}

/** Look up whichever layer (zone or element) an id refers to. */
export function findLayer(
  draft: StageLayout,
  id: string
): StageZone | ThemeElement | undefined {
  return (
    draft.zones.find((z) => z.id === id) ??
    draft.elements.find((e) => e.id === id)
  )
}
