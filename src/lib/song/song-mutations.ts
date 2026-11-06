import type {
  Song,
  SongArrangement,
  SongSection,
  SongSectionType,
} from "@/types/song"

/**
 * Pure mutation helpers for a `Song`'s embedded sections and arrangements
 * (Phase 2 lyric editor). Every function returns a **new** `Song` with a fresh
 * `updatedAt`, mutating nothing in place — the song store delegates to these so
 * the editing logic is unit-testable and lives in `lib/`, not the store.
 *
 * `newId`/`now` are injectable so tests get deterministic output; production
 * callers use the `crypto.randomUUID()` / `Date.now()` defaults.
 */

type IdFactory = () => string

const uuid: IdFactory = () => crypto.randomUUID()

/** Move `from`→`to` in a copy of `list`. Out-of-range indices are a no-op. */
function moveInList<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return list
  }
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// ── Sections ─────────────────────────────────────────────────────────────

/**
 * Append a new, empty section. Its label defaults to its numbered type.
 * The section is also appended to the **default** arrangement's order so it
 * shows up in generated slides immediately — otherwise a manually added
 * section is invisible until the operator wires it into an arrangement.
 */
export function addSection(
  song: Song,
  type: SongSectionType = "verse",
  now = Date.now(),
  newId: IdFactory = uuid
): Song {
  const sameType = song.sections.filter((s) => s.type === type).length
  const section: SongSection = {
    id: newId(),
    type,
    label: `${sectionTypeLabel(type)}${sameType > 0 ? ` ${sameType + 1}` : ""}`,
    lyrics: "",
  }
  return {
    ...song,
    sections: [...song.sections, section],
    arrangements: song.arrangements.map((a) =>
      a.isDefault ? { ...a, sectionIds: [...a.sectionIds, section.id] } : a
    ),
    updatedAt: now,
  }
}

export function updateSection(
  song: Song,
  sectionId: string,
  updates: Partial<Omit<SongSection, "id">>,
  now = Date.now()
): Song {
  return {
    ...song,
    sections: song.sections.map((s) =>
      s.id === sectionId ? { ...s, ...updates } : s
    ),
    updatedAt: now,
  }
}

/**
 * Remove a section and prune its id from every arrangement's order, so the
 * arrangement builder never shows a chip for a section that no longer exists.
 */
export function removeSection(
  song: Song,
  sectionId: string,
  now = Date.now()
): Song {
  return {
    ...song,
    sections: song.sections.filter((s) => s.id !== sectionId),
    arrangements: song.arrangements.map((arr) => ({
      ...arr,
      sectionIds: arr.sectionIds.filter((id) => id !== sectionId),
    })),
    updatedAt: now,
  }
}

export function reorderSection(
  song: Song,
  fromIndex: number,
  toIndex: number,
  now = Date.now()
): Song {
  const sections = moveInList(song.sections, fromIndex, toIndex)
  if (sections === song.sections) return song
  return { ...song, sections, updatedAt: now }
}

// ── Arrangements ─────────────────────────────────────────────────────────

/** Add a new (non-default) arrangement with an empty order. */
export function addArrangement(
  song: Song,
  name = "New Arrangement",
  now = Date.now(),
  newId: IdFactory = uuid
): Song {
  const arrangement: SongArrangement = {
    id: newId(),
    name,
    sectionIds: [],
    isDefault: false,
  }
  return {
    ...song,
    arrangements: [...song.arrangements, arrangement],
    updatedAt: now,
  }
}

export function updateArrangement(
  song: Song,
  arrangementId: string,
  updates: Partial<Omit<SongArrangement, "id" | "isDefault">>,
  now = Date.now()
): Song {
  return {
    ...song,
    arrangements: song.arrangements.map((a) =>
      a.id === arrangementId ? { ...a, ...updates } : a
    ),
    updatedAt: now,
  }
}

/**
 * Remove an arrangement, keeping the invariant that a song always has at least
 * one arrangement and exactly one is default. Removing the last arrangement is a
 * no-op; removing the default promotes the first survivor.
 */
export function removeArrangement(
  song: Song,
  arrangementId: string,
  now = Date.now()
): Song {
  if (song.arrangements.length <= 1) return song
  const remaining = song.arrangements.filter((a) => a.id !== arrangementId)
  if (remaining.length === song.arrangements.length) return song
  if (!remaining.some((a) => a.isDefault)) {
    remaining[0] = { ...remaining[0], isDefault: true }
  }
  return { ...song, arrangements: remaining, updatedAt: now }
}

/** Mark one arrangement default, clearing the flag on all others. */
export function setDefaultArrangement(
  song: Song,
  arrangementId: string,
  now = Date.now()
): Song {
  if (!song.arrangements.some((a) => a.id === arrangementId)) return song
  return {
    ...song,
    arrangements: song.arrangements.map((a) => ({
      ...a,
      isDefault: a.id === arrangementId,
    })),
    updatedAt: now,
  }
}

/** Append a section id to an arrangement's order (repeats are allowed). */
export function addSectionToArrangement(
  song: Song,
  arrangementId: string,
  sectionId: string,
  now = Date.now()
): Song {
  return {
    ...song,
    arrangements: song.arrangements.map((a) =>
      a.id === arrangementId
        ? { ...a, sectionIds: [...a.sectionIds, sectionId] }
        : a
    ),
    updatedAt: now,
  }
}

/** Remove the slot at `slotIndex` from an arrangement's order. */
export function removeArrangementSlot(
  song: Song,
  arrangementId: string,
  slotIndex: number,
  now = Date.now()
): Song {
  return {
    ...song,
    arrangements: song.arrangements.map((a) =>
      a.id === arrangementId
        ? { ...a, sectionIds: a.sectionIds.filter((_, i) => i !== slotIndex) }
        : a
    ),
    updatedAt: now,
  }
}

export function reorderArrangementSlot(
  song: Song,
  arrangementId: string,
  fromIndex: number,
  toIndex: number,
  now = Date.now()
): Song {
  return {
    ...song,
    arrangements: song.arrangements.map((a) =>
      a.id === arrangementId
        ? { ...a, sectionIds: moveInList(a.sectionIds, fromIndex, toIndex) }
        : a
    ),
    updatedAt: now,
  }
}

// ── Labels ───────────────────────────────────────────────────────────────

const SECTION_TYPE_LABELS: Record<SongSectionType, string> = {
  verse: "Verse",
  chorus: "Chorus",
  bridge: "Bridge",
  pre_chorus: "Pre-Chorus",
  intro: "Intro",
  ending: "Ending",
  tag: "Tag",
  interlude: "Interlude",
  custom: "Section",
}

export function sectionTypeLabel(type: SongSectionType): string {
  return SECTION_TYPE_LABELS[type]
}

export const SECTION_TYPES: SongSectionType[] = [
  "verse",
  "chorus",
  "bridge",
  "pre_chorus",
  "intro",
  "ending",
  "tag",
  "interlude",
  "custom",
]
