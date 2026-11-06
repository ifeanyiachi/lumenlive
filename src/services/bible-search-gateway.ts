import { invoke } from "@tauri-apps/api/core"
import type { Verse, SemanticSearchResult } from "@/types"
import { trackFeatureUsed } from "@/services/analytics-gateway"

/**
 * Gateway for the *raw* Bible-search IPC used by the search panel — the variants
 * that return results without writing them to a store, so callers can decide what
 * to do (populate a local dropdown, or fall back to a client-side search). The
 * store-writing convenience wrappers live in `use-bible.ts`; this keeps the panel
 * free of `@tauri-apps/*` and the backend command names.
 */

/** Fetch a chapter's verses without touching the shared `currentChapter` state. */
export function fetchChapter(
  translationId: number,
  bookNumber: number,
  chapter: number
): Promise<Verse[]> {
  return invoke<Verse[]>("get_chapter", { translationId, bookNumber, chapter })
}

/** Run the hybrid (vector + FTS5 BM25) semantic search; returns the raw results. */
export function runSemanticSearch(
  query: string,
  limit: number
): Promise<SemanticSearchResult[]> {
  trackFeatureUsed("semantic_search")
  return invoke<SemanticSearchResult[]>("semantic_search", { query, limit })
}
