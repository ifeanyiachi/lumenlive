import Fuse, { type IFuseOptions } from "fuse.js"
import { invoke } from "@tauri-apps/api/core"
import type { SemanticSearchResult } from "@/types/detection"

type VerseSearchRow = {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  text: string
}

type ContextSearchDoc = SemanticSearchResult

const DEFAULT_LIMIT = 15
const MIN_SIMILARITY = 0.55

// A translation is ~31k verses. Building the Fuse index over all of them in one
// synchronous `new Fuse(docs, ...)` call blocks the main thread for hundreds of
// ms — a visible freeze the first time the Fuse fallback is used. We instead
// build incrementally with `fuse.add`, yielding to the event loop whenever a
// build slice runs longer than BUILD_SLICE_MS, so no single task ever janks a
// frame. The resulting index is identical to the one-shot build (see the
// colocated parity test).
const BUILD_SLICE_MS = 6

/** Exported for the parity test only. */
export const FUSE_OPTIONS: IFuseOptions<ContextSearchDoc> = {
  includeScore: true,
  shouldSort: true,
  threshold: 0.35,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: [
    { name: "verse_text", weight: 0.92 },
    { name: "book_name", weight: 0.08 },
  ],
}

// Completed indexes, and in-flight builds keyed by translation so concurrent
// callers (e.g. successive keystrokes during the multi-frame build) share one
// build instead of each kicking off their own.
const fuseByTranslation = new Map<number, Fuse<ContextSearchDoc>>()
const buildInFlight = new Map<number, Promise<Fuse<ContextSearchDoc>>>()

function normalizeQuery(query: string) {
  return query.toLowerCase().replace(/\s+/g, " ").trim()
}

/** Exported for the parity test only. */
export function rowToDoc(row: VerseSearchRow): ContextSearchDoc {
  return {
    verse_ref: `${row.book_name} ${row.chapter}:${row.verse}`,
    verse_text: row.text,
    book_name: row.book_name,
    book_number: row.book_number,
    chapter: row.chapter,
    verse: row.verse,
    similarity: 0,
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

/** Yield to the event loop, preferring idle time so we never contend with input. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (
      globalThis as {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number }
        ) => number
      }
    ).requestIdleCallback
    if (typeof ric === "function") ric(() => resolve(), { timeout: 100 })
    else setTimeout(resolve, 0)
  })
}

/**
 * Build a Fuse index over every verse in a translation without blocking a frame.
 * Docs are added in time-sliced batches (~{@link BUILD_SLICE_MS} of work between
 * yields). Exported for the parity test; callers should use {@link getFuseIndex},
 * which caches and de-dupes.
 */
export async function buildFuseIndexFromRows(
  rows: VerseSearchRow[]
): Promise<Fuse<ContextSearchDoc>> {
  const fuse = new Fuse<ContextSearchDoc>([], FUSE_OPTIONS)
  let sliceStart = now()
  for (let i = 0; i < rows.length; i++) {
    fuse.add(rowToDoc(rows[i]))
    // Check the clock only every 128 docs — the check itself is cheap but not
    // free, and we don't need finer granularity than a frame.
    if ((i & 127) === 0 && now() - sliceStart > BUILD_SLICE_MS) {
      await yieldToEventLoop()
      sliceStart = now()
    }
  }
  return fuse
}

function getFuseIndex(translationId: number): Promise<Fuse<ContextSearchDoc>> {
  const existing = fuseByTranslation.get(translationId)
  if (existing) return Promise.resolve(existing)

  const inFlight = buildInFlight.get(translationId)
  if (inFlight) return inFlight

  const build = invoke<VerseSearchRow[]>("get_translation_verses_for_search", {
    translationId,
  })
    .then((rows) => buildFuseIndexFromRows(rows))
    .then((fuse) => {
      fuseByTranslation.set(translationId, fuse)
      buildInFlight.delete(translationId)
      return fuse
    })
    .catch((err) => {
      buildInFlight.delete(translationId)
      throw err
    })

  buildInFlight.set(translationId, build)
  return build
}

function fuseScoreToSimilarity(score: number | undefined) {
  // Fuse scores are 0 (best) -> 1 (worst), so invert for our UI confidence.
  const clamped = Math.min(1, Math.max(0, score ?? 1))
  return Number((1 - clamped).toFixed(4))
}

export function clearContextSearchCache(translationId?: number) {
  if (translationId == null) {
    fuseByTranslation.clear()
    buildInFlight.clear()
    return
  }
  fuseByTranslation.delete(translationId)
  buildInFlight.delete(translationId)
}

export async function searchContextWithFuse(
  query: string,
  translationId: number,
  limit = DEFAULT_LIMIT
): Promise<SemanticSearchResult[]> {
  const normalized = normalizeQuery(query)
  if (normalized.length < 2) return []

  const fuse = await getFuseIndex(translationId)
  const hits = fuse.search(normalized, { limit })

  return hits
    .map(({ item, score }) => ({
      ...item,
      similarity: fuseScoreToSimilarity(score),
    }))
    .filter((result) => result.similarity >= MIN_SIMILARITY)
}
