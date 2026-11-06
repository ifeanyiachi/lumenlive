import type { Slide } from "@/types/slide"
import type { ThemeType } from "@/types/theme"
import type { VerseRenderData } from "@/types/broadcast"
import type { CountdownFormat } from "@/types/alert"

/**
 * The presentation layer (themeredo.md, Phase 4).
 *
 * A *presentation mapper* turns a styled {@link Theme} plus the live/authored
 * content into the concrete {@link Slide}s that go on the output at go-live —
 * `(theme, content) → PresentedSlide[]`. This is the one place that knows how
 * each type's content flows into its placeholders, so the compositor and stage
 * paths never fill placeholders by hand.
 *
 * Two fill mechanisms, per the Phase-4 decisions:
 *  - **Text roles** (`lyrics`/`title`/`points`/`body`) are filled by
 *    *element-swap*: the mapper writes the text straight into the placeholder
 *    element on the produced slide. The slide is then self-contained.
 *  - **Scripture** is filled by a *render-time payload* (decision D2 →
 *    render-time): the scripture placeholder stays **style-only** on the slide,
 *    and the live {@link VerseRenderData} rides alongside as
 *    {@link PresentedSlide.scriptureContent}, handed to the renderer at draw
 *    time. This keeps the segment/verse-number/span structure the verse renderer
 *    needs (which a flat `verseText` string would lose) out of the persisted
 *    element model.
 *
 * PURE: mappers take an injected `newId`/`now` and never mutate the source theme
 * (they build on `themeToSlide`, which deep-clones).
 */

/**
 * One materialized output slide plus any render-time content that is *not* baked
 * into the slide itself.
 */
export interface PresentedSlide {
  /** The renderable slide (placeholders for text roles are already filled). */
  slide: Slide
  /**
   * Live scripture content for this slide's scripture placeholder, passed to the
   * renderer at draw time rather than baked into the element (decision D2). Set
   * only for `scripture` themes.
   */
  scriptureContent?: VerseRenderData
}

/**
 * The content a mapper fills into a theme's placeholders. Discriminated by
 * `type`, which must match the theme's {@link ThemeType}.
 */
export type PresentContent =
  | ScriptureContent
  | SongContent
  | CountdownContent
  | SermonContent
  | OverlayContent
  | AnnouncementContent

/** Live scripture: the pushed reference + verse segments. */
export interface ScriptureContent {
  type: "scripture"
  verse: VerseRenderData
}

/**
 * Song lyrics: one entry per lyric group (verse/chorus block). Each group
 * materializes into its own slide, so advancing groups advances slides.
 */
export interface SongContent {
  type: "song"
  groups: string[]
}

/**
 * Countdown live runtime. A themed countdown authors its look (background,
 * heading, timer placeholder) but the *ticking* is driven by a running
 * `ActiveCountdown`, not the placeholder's static config — so at go-live the
 * mapper element-swaps the live values onto the timer element (and the label
 * slot). Every field is optional: an empty `{type:"countdown"}` presents the
 * theme's authored placeholder as-is (authoring/preview).
 */
export interface CountdownContent {
  type: "countdown"
  /** Live seconds remaining; overrides the placeholder's static `durationSeconds`. */
  remainingSeconds?: number
  format?: CountdownFormat
  overtime?: boolean
  /** Recolor thresholds carried from the running timer. */
  warnSeconds?: number
  dangerSeconds?: number
  /**
   * Runtime label. When set (with `showLabel !== false`) it overrides the theme's
   * authored heading text (decision D5); when `showLabel` is false the label slot
   * is dropped from the presented slide.
   */
  label?: string
  showLabel?: boolean
}

/**
 * Sermon title + points. Authored at build time; the optional overrides let a
 * caller substitute live values without re-authoring the theme.
 */
export interface SermonContent {
  type: "sermon"
  title?: string
  points?: string
}

/** Overlay/lower-third composites over live; authored, no required content. */
export interface OverlayContent {
  type: "overlay"
}

/** Announcement title + body, authored with optional live overrides. */
export interface AnnouncementContent {
  type: "announcement"
  title?: string
  body?: string
}

/** The content variant a given theme type consumes. */
export type ContentForType<T extends ThemeType> = Extract<
  PresentContent,
  { type: T }
>
