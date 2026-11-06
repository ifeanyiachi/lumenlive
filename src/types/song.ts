/**
 * Song system types (Phase 1 foundation — see `documentation/songadd.md` §7).
 *
 * A song is a small, self-contained document: its `sections` and `arrangements`
 * are **embedded** in the record, not stored in separate tables, exactly like a
 * `Presentation` embeds its `Slide[]`. This keeps import/export/undo operating on
 * one plain-data object and follows the app's storage convention — every
 * user-editable entity lives in a Zustand store persisted to a `plugin-store`
 * JSON file, with string `crypto.randomUUID()` ids and `number` (`Date.now()`)
 * timestamps.
 */

import type { SlideTransitionType, AnimatedBackground } from "@/types/slide"

export type SongSectionType =
  | "verse"
  | "chorus"
  | "bridge"
  | "pre_chorus"
  | "intro"
  | "ending"
  | "tag"
  | "interlude"
  | "custom"

/** One labelled block of lyrics (a verse, the chorus, a bridge…). */
export interface SongSection {
  id: string
  type: SongSectionType
  label: string // "Verse 1", "Chorus", "Bridge 2"
  lyrics: string // plain text, line breaks preserved with "\n"
  lang?: string // BCP-47; defaults to the song's primary language
}

/**
 * A performance order over a song's sections. `sectionIds` references
 * `SongSection.id` values *within the same song* — an ordered, repeatable list
 * (a chorus id can appear several times). Ids that no longer resolve are simply
 * skipped when generating slides, so deleting a section never corrupts an
 * arrangement.
 */
export interface SongArrangement {
  id: string
  name: string // "Default", "Short", "Acoustic"
  sectionIds: string[]
  isDefault: boolean
}

/**
 * How a song is expanded into projectable slides. Defined here (in pure types)
 * rather than in the Phase 3 generator so `Song.slideOptions` can reference it
 * without `src/types/**` depending on `src/lib/**`. The auto-generator in
 * `lib/song/song-to-slides.ts` (Phase 3) consumes a fully-resolved value of this
 * shape; a global default lives in `settings-store` and a `Partial` override
 * lives on each `Song`.
 */
export interface SongSlideOptions {
  /** Built-in/user theme to skin each slide. Defaults to a "song"-category theme. */
  themeId: string
  /** Split a section into multiple slides once it exceeds this many lyric lines. */
  maxLinesPerSlide: number // e.g. 4
  /** Also break a section at blank lines (stanza breaks) even under the cap. */
  breakOnBlankLines: boolean // default true
  /** Prepend a title slide (song title + author). Default false. */
  includeTitleSlide: boolean
  /** Append a blank slide so the last click clears the screen. Default true. */
  includeBlankEndSlide: boolean
  /** Show the section label ("Verse 1") as a small badge/second element. */
  showSectionLabels: boolean
  /** Lyric font size in px; `null` inherits the theme's own size. Default null. */
  fontSize: number | null
  /** Transition applied to each generated slide; `"cut"` = no animation. */
  transition: SlideTransitionType
  /** Replace the theme background with transparency (for keying/overlay output). */
  transparentBackground: boolean
  /**
   * Override the theme's animated background params (preset/palette/speed/…).
   * Only applies when the resolved theme uses an animated background. Undefined
   * inherits the theme's own spec; individual fields merge over it.
   */
  animatedBackground?: Partial<AnimatedBackground>
}

/** Provenance — how a song entered the library. Useful for re-import/debug. */
export type SongSourceFormat =
  | "manual"
  | "openlyrics"
  | "opensong"
  | "chordpro"
  | "onsong"
  | "ccli_txt"
  | "ccli_usr"
  | "songbeamer"
  | "easyworship"
  | "propresenter"
  | "quelea"
  | "online"

export interface Song {
  id: string
  title: string
  alternateTitles?: string[]
  authors: string[] // split on import; joined for display
  copyright?: string
  ccliNumber?: string
  publisher?: string
  year?: string
  key?: string
  tempo?: string
  timeSignature?: string
  themes: string[]
  songbook?: string
  songbookEntry?: string
  notes?: string
  primaryLang: string // default "en"
  /**
   * Per-song projection overrides. Any field left undefined falls back to the
   * global defaults in `settings-store`. Lets a wordy hymn use 2 lines/slide
   * while the app default stays at 4, without touching other songs.
   */
  slideOptions?: Partial<SongSlideOptions>
  sections: SongSection[]
  arrangements: SongArrangement[] // always >= 1; exactly one isDefault
  sourceFormat: SongSourceFormat
  /**
   * Groups songs brought in by a single batch import (e.g. installing a
   * community song pack from the Store) so they can be removed together. Set to
   * the pack's catalog id on install; absent for hand-created songs and
   * one-off single-file imports. See `lib/song/community-packs`.
   */
  importBatchId?: string
  /** Human-readable origin of a batch import (the pack's name), for the UI. */
  importSource?: string
  createdAt: number
  updatedAt: number
}

/**
 * One "this song was projected" record, appended when a song goes live. Caches
 * the title/CCLI number so the CCLI usage report stays accurate even after the
 * song is deleted (same cache-not-FK reasoning as schedule items).
 */
export interface SongUsageEntry {
  id: string
  songId: string
  cachedTitle: string
  cachedCcliNumber?: string
  usedAt: number
  serviceName?: string
}

/** A blank, valid song: one empty verse and a default arrangement over it. */
export function createDefaultSong(title = "Untitled Song"): Song {
  const now = Date.now()
  const section: SongSection = {
    id: crypto.randomUUID(),
    type: "verse",
    label: "Verse 1",
    lyrics: "",
  }
  return {
    id: crypto.randomUUID(),
    title,
    authors: [],
    themes: [],
    primaryLang: "en",
    sections: [section],
    arrangements: [
      {
        id: crypto.randomUUID(),
        name: "Default",
        sectionIds: [section.id],
        isDefault: true,
      },
    ],
    sourceFormat: "manual",
    createdAt: now,
    updatedAt: now,
  }
}
