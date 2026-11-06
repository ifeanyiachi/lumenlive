/**
 * Pure query-word matching for the search-result highlighter. The component
 * splits result text into parts and asks, per part, whether it matches a word
 * the user typed. Extracted so the tokenisation rules live in one tested place.
 */

/**
 * The set of lowercased query words worth highlighting (length ≥ 2). Returns an
 * empty set for short/blank queries, which the caller treats as "highlight
 * nothing".
 */
export function buildQueryWordSet(query: string): Set<string> {
  return new Set(
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 2)
  )
}

/**
 * Whether a single text part (as produced by splitting on whitespace) should be
 * highlighted: strip punctuation, then match against the query words. Parts under
 * 2 cleaned characters are never highlighted.
 */
export function isHighlightedWord(
  part: string,
  queryWords: Set<string>
): boolean {
  const cleaned = part.toLowerCase().replace(/[^a-z']/g, "")
  return cleaned.length >= 2 && queryWords.has(cleaned)
}
