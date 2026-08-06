import {
  decodeXmlEntities,
  inferSectionType,
  labelFromVerseName,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * OpenSong XML importer (P2). One `<lyrics>` text block holds the whole song,
 * with `[V1]`/`[C]`/`[Bridge]` section markers; lyric lines are indented, chord
 * lines start with `.`, comment lines with `;`, and `---` marks a page break. A
 * `<presentation>` element gives the performance order.
 */
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")
  )
  return m ? decodeXmlEntities(m[1]).trim() : undefined
}

/** A section marker like `[V1]` → { label, name }. Codes reuse verse-name labels. */
function markerToSection(marker: string): { label: string; name?: string } {
  const t = marker.trim()
  if (/^[a-z]\d*$/i.test(t)) return { label: labelFromVerseName(t), name: t }
  return { label: t }
}

export function parseOpenSong(xml: string): ParsedSong {
  const title = tag(xml, "title") ?? "Untitled Song"
  const authorRaw = tag(xml, "author")
  const authors = authorRaw
    ? authorRaw
        .split(/[,;/]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean)
    : []
  const copyright = tag(xml, "copyright")
  const ccliNumber = tag(xml, "ccli")
  const key = tag(xml, "key")
  const presentation = tag(xml, "presentation")
  const verseOrder = presentation
    ? presentation.split(/\s+/).filter(Boolean)
    : undefined

  const lyricsBlock =
    xml.match(/<lyrics(?:\s[^>]*)?>([\s\S]*?)<\/lyrics>/i)?.[1] ?? ""
  const lines = decodeXmlEntities(lyricsBlock).split("\n")

  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null
  const push = () => {
    if (current) {
      current.lyrics = current.lyrics.replace(/\n{3,}/g, "\n\n").trim()
      sections.push(current)
      current = null
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "")
    const marker = line.trim().match(/^\[(.+)\]$/)
    if (marker) {
      push()
      const { label, name } = markerToSection(marker[1])
      current = {
        type: inferSectionType(name ?? label),
        label,
        name,
        lyrics: "",
      }
      continue
    }
    const trimmed = line.trim()
    if (trimmed.startsWith(".") || trimmed.startsWith(";")) continue // chords / comments
    if (trimmed === "---") {
      if (current) current.lyrics += "\n"
      continue
    }
    const lyric = line.replace(/^ /, "") // OpenSong indents lyric lines by one space
    if (!current) current = { type: "verse", label: "Verse 1", lyrics: "" }
    if (lyric.trim() === "") {
      current.lyrics += "\n"
    } else {
      current.lyrics = current.lyrics ? `${current.lyrics}\n${lyric}` : lyric
    }
  }
  push()

  return { title, authors, copyright, ccliNumber, key, sections, verseOrder }
}
