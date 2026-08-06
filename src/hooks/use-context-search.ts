import { useCallback, useEffect, useRef, useState } from "react"
import { useBibleStore } from "@/stores"
import { searchContextWithFuse } from "@/lib/context-search"
import { runSemanticSearch } from "@/services/bible-search-gateway"

/**
 * Context (meaning-based) verse search: debounced querying with a hybrid backend
 * (vector + FTS5 BM25) as primary and a client-side Fuse.js fallback when the
 * semantic model isn't loaded. Owns the debounce timer, the request-id staleness
 * guard, and the `contextQuery` input state; writes results into the bible store.
 *
 * Extracted verbatim from `SearchPanel` so the panel expresses intent
 * ("here's the query, keep results fresh") without embedding IPC + debounce +
 * fallback logic in the view. Behavior is unchanged.
 */
export function useContextSearch(params: {
  activeTab: "book" | "context"
  activeTranslationId: number
}) {
  const { activeTab, activeTranslationId } = params

  const [contextQuery, setContextQuery] = useState("")
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
      useBibleStore.getState().setSemanticResults(fuseResults)
    },
    []
  )

  const handleContextSearch = useCallback(
    (query: string) => {
      setContextQuery(query)
      if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
      if (query.length >= 5) {
        const translationId = useBibleStore.getState().activeTranslationId
        contextDebounceRef.current = setTimeout(() => {
          runContextSearch(query, translationId).catch(console.error)
        }, 280)
      } else {
        contextSearchRequestIdRef.current += 1
        useBibleStore.getState().setSemanticResults([])
      }
    },
    [runContextSearch]
  )

  useEffect(() => {
    if (activeTab !== "context" || contextQuery.length < 5) return
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    contextDebounceRef.current = setTimeout(() => {
      runContextSearch(contextQuery, activeTranslationId).catch(console.error)
    }, 120)
  }, [activeTranslationId, activeTab, contextQuery, runContextSearch])

  useEffect(() => {
    return () => {
      if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    }
  }, [])

  return { contextQuery, setContextQuery, handleContextSearch }
}
