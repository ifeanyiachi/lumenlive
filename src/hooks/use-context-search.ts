import { useCallback, useEffect, useRef, useState } from "react"
import { useBibleStore } from "@/stores"
import { searchContextWithFuse } from "@/lib/context-search"
import { runSemanticSearch } from "@/services/bible-search-gateway"

/**
 * Context (meaning-based) verse search: debounced querying with a hybrid backend
 * (vector + FTS5 BM25) as primary and a client-side Fuse.js fallback when the
 * semantic model isn't loaded. Owns the debounce timer and the request-id
 * staleness guard; writes results into the bible store.
 *
 * The live keystroke text is deliberately NOT returned — it lives inside the
 * isolated `ContextSearchInput` leaf so typing re-renders only that field, never
 * the panel or the (heavy) results list. What the hook exposes instead is
 * `committedQuery`: the query string that produced the results currently in the
 * store. It changes only when a search completes, so the results list — which
 * uses it for match highlighting and its empty-state copy — re-renders once per
 * result set, not once per keystroke. The latest typed text is kept in a ref
 * (`latestQueryRef`) so the translation-change effect can re-run the active
 * search without pulling the live text through React state.
 */
export function useContextSearch(params: {
  activeTab: "book" | "context"
  activeTranslationId: number
}) {
  const { activeTab, activeTranslationId } = params

  // The query that produced the results currently in the store (drives
  // highlighting + empty state). Updated only when a search actually runs.
  const [committedQuery, setCommittedQuery] = useState("")
  // Latest typed text, for the translation-change re-run — not render state.
  const latestQueryRef = useRef("")
  const contextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextSearchRequestIdRef = useRef(0)

  const runContextSearch = useCallback(
    async (query: string, translationId: number) => {
      const requestId = ++contextSearchRequestIdRef.current
      const isStale = () => requestId !== contextSearchRequestIdRef.current

      // Primary: hybrid search backend (combines vector + FTS5 BM25)
      const hybridResults = await runSemanticSearch(query, 15).catch(() => null)

      if (isStale()) return

      if (hybridResults && hybridResults.length > 0) {
        // Set the highlight query before the results so a render never pairs new
        // results with a stale query.
        setCommittedQuery(query)
        useBibleStore.getState().setSemanticResults(hybridResults)
        return
      }

      // Fallback: client-side Fuse.js when semantic model is not loaded
      const fuseResults = await searchContextWithFuse(
        query,
        translationId,
        15
      ).catch(() => [])
      if (isStale()) return
      setCommittedQuery(query)
      useBibleStore.getState().setSemanticResults(fuseResults)
    },
    []
  )

  const handleContextSearch = useCallback(
    (query: string) => {
      latestQueryRef.current = query
      if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
      if (query.length >= 5) {
        const translationId = useBibleStore.getState().activeTranslationId
        contextDebounceRef.current = setTimeout(() => {
          runContextSearch(query, translationId).catch(console.error)
        }, 280)
      } else {
        contextSearchRequestIdRef.current += 1
        setCommittedQuery("")
        useBibleStore.getState().setSemanticResults([])
      }
    },
    [runContextSearch]
  )

  // Re-run the active search when the translation changes (or the context tab
  // regains focus with a query already typed). Reads the live query from the ref
  // so it fires on translation/tab change without being re-bound per keystroke.
  useEffect(() => {
    if (activeTab !== "context") return
    const query = latestQueryRef.current
    if (query.length < 5) return
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    contextDebounceRef.current = setTimeout(() => {
      runContextSearch(query, activeTranslationId).catch(console.error)
    }, 120)
  }, [activeTranslationId, activeTab, runContextSearch])

  // Reset when the operator (re-)enters the context tab: drop the highlight
  // query and invalidate any in-flight search so an old query can't re-run (e.g.
  // via the translation-change effect below). The input leaf remounts empty on
  // its own, so its text needs no clearing here. Called from an event handler,
  // not an effect, to avoid a synchronous setState-in-effect.
  const resetContextSearch = useCallback(() => {
    latestQueryRef.current = ""
    contextSearchRequestIdRef.current += 1
    setCommittedQuery("")
  }, [])

  useEffect(() => {
    return () => {
      if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    }
  }, [])

  return { committedQuery, handleContextSearch, resetContextSearch }
}
