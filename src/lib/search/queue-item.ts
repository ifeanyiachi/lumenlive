import type { Verse } from "@/types"
import type { QueueItem } from "@/types/queue"

/**
 * The semantic inputs for a manually-queued verse item — everything that varies
 * between the three add-to-queue sites (book row, context row, multi-verse
 * group). `id`, `source: "manual"`, and `added_at` are generated identically for
 * all three, so they live here rather than being re-written at each call.
 */
export interface MakeQueueItemArgs {
  verse: Verse
  reference: string
  confidence: number
  /** Present only for a grouped multi-verse selection. */
  verses?: Verse[]
}

/**
 * Build a manual {@link QueueItem}. Collapses the three duplicated construction
 * sites: the book-row add (`confidence: 1`), the context-row add
 * (`confidence: similarity`), and the multi-verse group (`verses` array +
 * `buildMultiVerseReference`). Callers supply the reference string and confidence
 * they need; `verses` is omitted (not set to `undefined`) for a single verse, so
 * the output matches the originals byte-for-byte.
 */
export function makeQueueItem({
  verse,
  reference,
  confidence,
  verses,
}: MakeQueueItemArgs): QueueItem {
  return {
    id: crypto.randomUUID(),
    verse,
    reference,
    confidence,
    source: "manual",
    added_at: Date.now(),
    ...(verses ? { verses } : {}),
  }
}
