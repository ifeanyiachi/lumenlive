import {
  createDefaultTextElement,
  type AnimatedBackground,
  type Presentation,
  type Slide,
  type SlideBackground,
  type SlideElement,
  type SlideTextElement,
} from "@/types/slide"
import type {
  Song,
  SongArrangement,
  SongSection,
  SongSlideOptions,
} from "@/types/song"
import { resolveThemeSlideContent } from "@/lib/presentation/presentation-mutations"

/**
 * Auto slide generation (design doc §9) — the headline operator feature: expand a
 * song + arrangement into a ready-to-project `Presentation`, one or more slides
 * per section, honouring the arrangement's (possibly repeating) section order.
 *
 * PURE: no React, no Zustand, no Tauri. Given the same inputs (with `newId`/`now`
 * injected) it returns byte-identical output, so it carries a parity/golden test
 * and can be called from the editor preview, the schedule at go-live, or import.
 */

const uuid = () => crypto.randomUUID()

const FALLBACK_BACKGROUND: SlideBackground = { type: "solid", color: "#000000" }

/** The app-wide default projection options; overridden per-song and in settings. */
export const DEFAULT_SONG_SLIDE_OPTIONS: SongSlideOptions = {
  themeId: "theme-worship-lyrics",
  maxLinesPerSlide: 4,
  breakOnBlankLines: true,
  includeTitleSlide: false,
  includeBlankEndSlide: true,
  showSectionLabels: false,
  fontSize: null,
  transition: "cut",
  transparentBackground: false,
}

/** Duration (ms) for non-cut slide transitions on generated song slides. */
export const SONG_SLIDE_TRANSITION_MS = 500

/**
 * Merge a per-song `Partial` override onto the global defaults, field by field —
 * an undefined override field inherits the default (matching the "inherited vs
 * overridden" UX in the editor's projection panel).
 */
export function resolveSongSlideOptions(
  defaults: SongSlideOptions,
  override?: Partial<SongSlideOptions>
): SongSlideOptions {
  return {
    themeId: override?.themeId ?? defaults.themeId,
    maxLinesPerSlide: override?.maxLinesPerSlide ?? defaults.maxLinesPerSlide,
    breakOnBlankLines:
      override?.breakOnBlankLines ?? defaults.breakOnBlankLines,
    includeTitleSlide:
      override?.includeTitleSlide ?? defaults.includeTitleSlide,
    includeBlankEndSlide:
      override?.includeBlankEndSlide ?? defaults.includeBlankEndSlide,
    showSectionLabels:
      override?.showSectionLabels ?? defaults.showSectionLabels,
    // The three fields below postdate the first release, so a persisted
    // settings object may not carry them — fall back to the app default.
    // `fontSize` uses explicit undefined checks because `null` ("inherit the
    // theme's size") is a real value that `??` would skip over.
    fontSize:
      override?.fontSize !== undefined
        ? override.fontSize
        : (defaults.fontSize ?? DEFAULT_SONG_SLIDE_OPTIONS.fontSize),
    transition:
      override?.transition ??
      defaults.transition ??
      DEFAULT_SONG_SLIDE_OPTIONS.transition,
    transparentBackground:
      override?.transparentBackground ??
      defaults.transparentBackground ??
      DEFAULT_SONG_SLIDE_OPTIONS.transparentBackground,
    animatedBackground:
      override?.animatedBackground ?? defaults.animatedBackground,
  }
}

/**
 * Merge a per-song animated-background override onto a resolved theme
 * background. No-op unless the background is animated and an override exists;
 * returns a fresh object so callers never mutate the theme's cloned spec.
 */
function withAnimatedOverride(
  bg: SlideBackground,
  override?: Partial<AnimatedBackground>
): SlideBackground {
  if (!override || bg.type !== "animated" || !bg.animated) return bg
  return { ...bg, animated: { ...bg.animated, ...override } }
}

/**
 * Split one section's lyrics into slide-sized chunks:
 *  1. optionally break at blank lines (stanza-aware), then
 *  2. hard-wrap any stanza longer than `maxLinesPerSlide` lines.
 * Empty lines are dropped; a section that is all whitespace yields no chunks.
 */
export function chunkSectionLyrics(
  lyrics: string,
  maxLinesPerSlide: number,
  breakOnBlankLines: boolean
): string[] {
  const maxLines = Math.max(1, Math.floor(maxLinesPerSlide))
  const stanzas = breakOnBlankLines ? lyrics.split(/\n[ \t]*\n+/) : [lyrics]
  const chunks: string[] = []
  for (const stanza of stanzas) {
    const lines = stanza
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    for (let i = 0; i < lines.length; i += maxLines) {
      chunks.push(lines.slice(i, i + maxLines).join("\n"))
    }
  }
  return chunks
}

function firstTextElement(elements?: SlideElement[]): SlideTextElement | null {
  const el = elements?.find((e): e is SlideTextElement => e.type === "text")
  return el ?? null
}

/** Clone a text style template (or the app default) with a fresh id and text. */
function textFrom(
  style: SlideTextElement | null,
  text: string,
  newId: () => string
): SlideTextElement {
  const base = style ? structuredClone(style) : createDefaultTextElement()
  return { ...base, id: newId(), type: "text", text }
}

function makeSlide(
  name: string,
  background: SlideBackground,
  elements: SlideElement[],
  newId: () => string,
  now: number
): Slide {
  return {
    id: newId(),
    name,
    background: structuredClone(background),
    elements,
    createdAt: now,
    updatedAt: now,
  }
}

function buildLyricSlide(
  text: string,
  section: SongSection,
  options: SongSlideOptions,
  background: SlideBackground,
  style: SlideTextElement | null,
  newId: () => string,
  now: number
): Slide {
  const lyric = textFrom(style, text, newId)
  if (options.fontSize !== null) lyric.fontSize = options.fontSize
  const elements: SlideElement[] = [lyric]
  if (options.showSectionLabels) {
    elements.push({
      ...createDefaultTextElement(),
      id: newId(),
      text: section.label,
      x: 3,
      y: 3,
      width: 40,
      height: 8,
      fontSize: 20,
      fontWeight: 500,
      color: lyric.color,
      horizontalAlign: "left",
      verticalAlign: "top",
      textTransform: "uppercase",
    })
  }
  return makeSlide(section.label, background, elements, newId, now)
}

function buildTitleSlide(
  song: Song,
  background: SlideBackground,
  style: SlideTextElement | null,
  newId: () => string,
  now: number
): Slide {
  const title = textFrom(style, song.title, newId)
  title.x = 5
  title.y = 30
  title.width = 90
  title.height = 25
  title.fontSize = 72
  title.fontWeight = 700
  title.horizontalAlign = "center"
  title.verticalAlign = "middle"

  const elements: SlideElement[] = [title]
  if (song.authors.length > 0) {
    const author = textFrom(style, song.authors.join(", "), newId)
    author.x = 10
    author.y = 58
    author.width = 80
    author.height = 12
    author.fontSize = 32
    author.fontWeight = 400
    author.horizontalAlign = "center"
    author.verticalAlign = "middle"
    elements.push(author)
  }
  return makeSlide("Title", background, elements, newId, now)
}

export function generateSlidesFromSong(
  song: Song,
  arrangement: SongArrangement,
  options: SongSlideOptions,
  newId: () => string = uuid,
  now: number = Date.now()
): Presentation {
  // Resolve the chosen theme's content + blank backgrounds and lyric typography
  // once; each slide clones from these so no two slides share nested objects.
  const content = resolveThemeSlideContent(
    options.themeId,
    "content-only",
    newId
  )
  const blank = resolveThemeSlideContent(options.themeId, "blank", newId)
  // Transparent output replaces the theme background entirely (lyrics keyed
  // over live video / NDI); the theme still supplies typography.
  const transparent: SlideBackground = { type: "transparent" }
  const background = options.transparentBackground
    ? transparent
    : withAnimatedOverride(
        content?.background ?? FALLBACK_BACKGROUND,
        options.animatedBackground
      )
  const blankBackground = options.transparentBackground
    ? transparent
    : withAnimatedOverride(
        blank?.background ?? background,
        options.animatedBackground
      )
  const lyricStyle = firstTextElement(content?.elements)

  const sectionById = new Map(song.sections.map((s) => [s.id, s]))
  const slides: Slide[] = []

  if (options.includeTitleSlide) {
    slides.push(buildTitleSlide(song, background, lyricStyle, newId, now))
  }

  // Honour the arrangement order, skipping ids that no longer resolve to a
  // section (deleting a section never corrupts an arrangement).
  for (const sectionId of arrangement.sectionIds) {
    const section = sectionById.get(sectionId)
    if (!section) continue
    for (const chunk of chunkSectionLyrics(
      section.lyrics,
      options.maxLinesPerSlide,
      options.breakOnBlankLines
    )) {
      slides.push(
        buildLyricSlide(
          chunk,
          section,
          options,
          background,
          lyricStyle,
          newId,
          now
        )
      )
    }
  }

  if (options.includeBlankEndSlide) {
    slides.push(makeSlide("Blank", blankBackground, [], newId, now))
  }

  // Stamp the chosen transition on every slide; "cut" keeps the field absent
  // so pre-existing decks (and golden tests) are unchanged.
  if (options.transition !== "cut") {
    for (const slide of slides) {
      slide.transition = {
        type: options.transition,
        duration: SONG_SLIDE_TRANSITION_MS,
      }
    }
  }

  return {
    id: newId(),
    name: song.title,
    slides,
    createdAt: now,
    updatedAt: now,
  }
}
