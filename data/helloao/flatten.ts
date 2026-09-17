/**
 * Flatten a bible.helloao.org verse's inner `content` array into plain text.
 *
 * A verse item is `{ type:"verse", number, content:[ … ] }`; its inner `content`
 * mixes plain **strings** with objects:
 *   - a string                     → the verse text, appended verbatim
 *   - `{ text: string, … }`        → a formatted segment (poem indent,
 *                                     words-of-Jesus, …); its `text` is appended
 *   - `{ lineBreak: true }`        → rendered as a single space
 *   - `{ noteId }`                 → footnote reference: the marker is dropped
 *                                     but its position is a WORD BOUNDARY
 *   - `{ poem: n }` (no text)      → poetry-indent marker, dropped
 *   - anything else                → dropped
 *
 * Footnote boundaries matter: the source splits a string exactly at the marker
 * and keeps NO space on either side (the superscript glyph supplied the gap), so
 * naively concatenating fuses words — "one and only" + "Son" → "onlySon". We
 * therefore insert a single space where a dropped `{noteId}` sat, but only
 * between two real word characters — never before punctuation ("life" + "." must
 * stay "life."), and never by touching a space that lives inside a string (which
 * would corrupt e.g. French space-before-`;:!?` typography). Runs of whitespace
 * are collapsed and the result trimmed.
 *
 * Pure: no I/O, no globals — unit-tested in `flatten.test.ts`.
 */
export function flattenVerseContent(content: readonly unknown[]): string {
  let out = ""
  // A dropped footnote marker leaves a pending word boundary: the next appended
  // text gets a single separating space unless one side is already whitespace or
  // the next char is punctuation.
  let pendingBoundary = false
  const isCloser = (ch: string) => /[.,;:!?)\]}]/.test(ch)

  const append = (s: string) => {
    if (pendingBoundary) {
      pendingBoundary = false
      const last = out.slice(-1)
      const first = s.slice(0, 1)
      if (
        out &&
        first &&
        !/\s/.test(last) &&
        !/\s/.test(first) &&
        !isCloser(first)
      ) {
        out += " "
      }
    }
    out += s
  }

  for (const item of content) {
    if (typeof item === "string") {
      append(item)
      continue
    }
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>
      if (typeof obj.text === "string") {
        append(obj.text)
        continue
      }
      if (obj.lineBreak === true) {
        pendingBoundary = false
        out += " "
        continue
      }
      if (typeof obj.noteId !== "undefined") {
        pendingBoundary = true
        continue
      }
      // bare poem markers and any other non-text object → ignored
    }
  }
  return out.replace(/\s+/g, " ").trim()
}
