import type { Slide, SlideImageElement } from "@/types/slide"
import type { OriginalWord, LexiconEntry } from "@/types"
import type { LexiconScheduleItem } from "@/types/schedule"
import { decodePartOfSpeech } from "@/lib/morph"
import {
  renderLexiconCardToDataUrl,
  type LexiconCardData,
} from "@/lib/lexicon-card-renderer"
import { preloadSlideImage } from "@/lib/slide-image-cache"

/** A short, human-readable label for a word-study card (e.g. "Kai · G2532"). */
export function lexiconCardLabel(
  word: OriginalWord,
  reference: string
): string {
  const strong = word.strong_number ? ` · ${word.strong_number}` : ""
  return `${word.word}${strong} — ${reference}`
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Builds the one-line summary shown under the header: "translit: short gloss". */
function buildSummary(
  translit: string | undefined,
  gloss: string | null | undefined,
  definition: string | null | undefined,
  kjvUsage: string | null | undefined
): string | undefined {
  const head = translit
  // Prefer a concise curated gloss; fall back to the leading clause of the
  // Strong's definition, then to KJV usage.
  let tail = gloss ?? undefined
  if (!tail && definition) tail = definition.split(/[;.]/)[0]?.trim()
  if (!tail && kjvUsage)
    tail = kjvUsage.split(",").slice(0, 4).join(", ").trim()
  if (!head && !tail) return undefined
  if (!tail) return head
  return `${head ?? ""}${head ? ": " : ""}${capitalizeFirst(tail)}`
}

/**
 * Assembles the {@link LexiconCardData} for a word from its interlinear row and
 * Strong's entry. `entry.derivation` (Word Origin) is available only after the
 * lexicon DB is rebuilt with `bun run setup:lexicon`; it degrades gracefully.
 */
export function toLexiconCardData(
  word: OriginalWord,
  entry: LexiconEntry | null,
  reference: string,
  isHebrew: boolean
): LexiconCardData {
  const translit = entry?.translit ?? word.translit ?? undefined
  const definition = entry?.definition ?? word.gloss ?? undefined
  return {
    reference,
    strong: word.strong_number ?? undefined,
    lemma: entry?.lemma ?? word.word,
    partOfSpeech: decodePartOfSpeech(word.morph, isHebrew) ?? undefined,
    transliteration: translit,
    pronunciation: entry?.pronunciation ?? undefined,
    kjvUsage: entry?.kjv_usage ?? undefined,
    wordOrigin: entry?.derivation ?? undefined,
    definition,
    summary: buildSummary(
      translit,
      word.gloss,
      entry?.definition,
      entry?.kjv_usage
    ),
    isHebrew,
  }
}

/**
 * Builds a projectable "Lexical Summary" slide from an original-language word
 * and its Strong's entry. The card is rasterized to a data URL and embedded as
 * a full-bleed image element, so it presents via the existing slide pipeline
 * (`setLiveSlide`) — Go Live, Queue, preview, and NDI all work unchanged.
 */
export function buildLexiconSlide(
  word: OriginalWord,
  entry: LexiconEntry | null,
  reference: string,
  isHebrew: boolean
): Slide {
  const data = toLexiconCardData(word, entry, reference, isHebrew)
  const imageUrl = renderLexiconCardToDataUrl(data)

  // Warm the operator-side slide cache so the preview paints immediately (the
  // output window preloads image-element URLs on its own).
  void preloadSlideImage(imageUrl).catch(() => {})

  const image: SlideImageElement = {
    id: crypto.randomUUID(),
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    imageUrl,
    objectFit: "fill",
    opacity: 1,
    borderRadius: 0,
  }

  return {
    id: crypto.randomUUID(),
    name: lexiconCardLabel(word, reference),
    background: { type: "solid", color: "#f8fafc" },
    elements: [image],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Builds a schedule item that presents a word's Lexical Summary card. It carries
 * the rendered {@link Slide} inline (see {@link buildLexiconSlide}) so it
 * presents exactly like Go Live — the card, not the source verse — and needs no
 * entry in the presentation library. `order` is assigned by the caller/store.
 */
export function buildLexiconScheduleItem(
  word: OriginalWord,
  entry: LexiconEntry | null,
  reference: string,
  isHebrew: boolean,
  order: number
): LexiconScheduleItem {
  return {
    id: crypto.randomUUID(),
    type: "lexicon",
    label: lexiconCardLabel(word, reference),
    order,
    notes: "",
    reference,
    strong: word.strong_number ?? undefined,
    slide: buildLexiconSlide(word, entry, reference, isHebrew),
  }
}
