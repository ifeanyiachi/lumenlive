import {
  inferSectionType,
  labelFromVerseName,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * OpenLyrics XML importer (P0) — the ecosystem lingua franca. Deliberately
 * regex/string-based rather than DOM-based: the Vitest suite runs in a Node
 * environment with no `DOMParser`, and the OpenLyrics subset we consume (titles,
 * authors, ccliNo, copyright, verseOrder, verses → lines) is well-defined enough
 * to extract without a full XML parser. Inline `<chord>`/`<tag>` markup is
 * stripped (lyrics-only), `<br/>` becomes a newline, multiple `<lines>` blocks in
 * a verse become blank-line-separated stanzas.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => ENTITIES[m] ?? m)
}

// `(?:\\s[^>]*)?>` after the tag name matches `<title>` / `<title attr>` but not
// the sibling `<titles>` (whose "s" would otherwise be swallowed by `[^>]*`).
function firstTag(xml: string, tag: string): string | undefined {
  const m = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  )
  return m ? decodeEntities(m[1].trim()) : undefined
}

function allTags(xml: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi")
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeEntities(m[1].trim()))
  }
  return out
}

/** Convert one `<lines>` block's inner XML to plain multi-line text. */
function linesBlockToText(inner: string): string {
  return decodeEntities(
    inner
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(?:tag|chord|comment)\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
}

export function parseOpenLyrics(xml: string): ParsedSong {
  // Restrict metadata lookups to <properties> so a lyric line can't shadow them.
  const properties =
    xml.match(/<properties>([\s\S]*?)<\/properties>/i)?.[1] ?? xml

  const title = firstTag(properties, "title") ?? "Untitled Song"
  const authors = allTags(properties, "author")
  const ccliNumber =
    firstTag(properties, "ccliNo") ?? firstTag(properties, "ccli")
  const copyright = firstTag(properties, "copyright")
  const publisher = firstTag(properties, "publisher")
  const year = firstTag(properties, "released")
  const key = firstTag(properties, "key")
  const themes = allTags(properties, "theme")
  const verseOrderRaw = firstTag(properties, "verseOrder")
  const verseOrder = verseOrderRaw
    ? verseOrderRaw.split(/\s+/).filter(Boolean)
    : undefined

  const sections: ParsedSection[] = []
  const verseRe = /<verse\b([^>]*)>([\s\S]*?)<\/verse>/gi
  let vm: RegExpExecArray | null
  while ((vm = verseRe.exec(xml)) !== null) {
    const attrs = vm[1]
    const body = vm[2]
    const name = attrs.match(/name\s*=\s*"([^"]*)"/i)?.[1]?.trim() ?? ""
    const stanzas: string[] = []
    const linesRe = /<lines\b[^>]*>([\s\S]*?)<\/lines>/gi
    let lm: RegExpExecArray | null
    while ((lm = linesRe.exec(body)) !== null) {
      const text = linesBlockToText(lm[1])
      if (text) stanzas.push(text)
    }
    const label = name
      ? labelFromVerseName(name)
      : `Verse ${sections.length + 1}`
    sections.push({
      type: inferSectionType(name || label),
      label,
      name: name || undefined,
      lyrics: stanzas.join("\n\n"),
    })
  }

  return {
    title,
    authors,
    ccliNumber,
    copyright,
    publisher,
    year,
    key,
    themes: themes.length ? themes : undefined,
    sections,
    verseOrder,
  }
}
