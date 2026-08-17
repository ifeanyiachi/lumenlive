import { buildQueryWordSet, isHighlightedWord } from "@/lib/search/highlight"

/** Highlights words from the query that appear in the text. */
export function HighlightedText({
  text,
  query,
}: {
  text: string
  query: string
}) {
  if (!query || query.length < 2) return <>{text}</>

  const queryWords = buildQueryWordSet(query)
  if (queryWords.size === 0) return <>{text}</>

  // Split text into words while preserving whitespace/punctuation
  const parts = text.split(/(\s+)/)
  return (
    <>
      {parts.map((part, i) => {
        if (isHighlightedWord(part, queryWords)) {
          return (
            <mark
              key={i}
              className="rounded-[2px] bg-emerald-800/90 px-0.5 text-foreground"
            >
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
