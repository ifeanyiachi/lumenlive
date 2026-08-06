import {
  decodeXmlEntities,
  inferSectionType,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * Quelea song XML importer (P3). Quelea distributes song packs as `.qsp`
 * (ZIP-of-XML) — extracting the archive needs a ZIP reader, but a single Quelea
 * `<song>` XML (its per-song export) parses directly here: title/author/ccli
 * metadata plus `<section title="…">` blocks whose text lives in a nested
 * `<lyrics>` element.
 */
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")
  )
  return m ? decodeXmlEntities(m[1]).trim() : undefined
}

export function parseQuelea(xml: string): ParsedSong {
  const title = tag(xml, "title") ?? "Untitled Song"
  const authorRaw = tag(xml, "author")
  const authors = authorRaw
    ? authorRaw
        .split(/[,;/]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean)
    : []
  const ccliNumber = tag(xml, "ccli")
  const copyright = tag(xml, "copyright")
  const key = tag(xml, "key")

  const sections: ParsedSection[] = []
  const sectionRe = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi
  let s: RegExpExecArray | null
  let count = 0
  while ((s = sectionRe.exec(xml)) !== null) {
    const attrs = s[1]
    const body = s[2]
    const rawTitle = attrs.match(/\btitle="([^"]*)"/i)?.[1]
    // Text is inside a nested <lyrics>, or the raw section body for older files.
    const inner =
      body.match(/<lyrics(?:\s[^>]*)?>([\s\S]*?)<\/lyrics>/i)?.[1] ?? body
    const lyrics = decodeXmlEntities(inner.replace(/<[^>]+>/g, ""))
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    count += 1
    const label = rawTitle ? decodeXmlEntities(rawTitle) : `Verse ${count}`
    sections.push({ type: inferSectionType(label), label, lyrics })
  }

  return { title, authors, ccliNumber, copyright, key, sections }
}
