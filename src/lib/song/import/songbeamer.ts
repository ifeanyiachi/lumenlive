import {
  inferSectionType,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * SongBeamer `.sng` importer (P2). An INI-like `#Key=Value` header precedes the
 * verses, which are separated by `---`. The first line of each verse block is its
 * caption (e.g. "Verse 1", "Chorus"); the rest are lyrics. `#VerseOrder` lists
 * captions in performance order (the "STOP" terminator is dropped).
 */
export function parseSongBeamer(text: string): ParsedSong {
  const noBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const norm = noBom.replace(/\r\n/g, "\n")
  const blocks = norm.split(/\n---[ \t]*\n?/)

  const headerBlock = blocks.shift() ?? ""
  const header = new Map<string, string>()
  for (const line of headerBlock.split("\n")) {
    const m = line.match(/^#([^=]+)=(.*)$/)
    if (m) header.set(m[1].trim().toLowerCase(), m[2].trim())
  }

  const title = header.get("title") ?? "Untitled Song"
  const authorRaw = header.get("author")
  const authors = authorRaw
    ? authorRaw
        .split(/[,;/]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean)
    : []
  const ccliNumber = header.get("ccli")
  const copyright = header.get("(c)") ?? header.get("copyright")
  const key = header.get("key")
  const orderRaw = header.get("verseorder")
  const verseOrder = orderRaw
    ? orderRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s.toUpperCase() !== "STOP")
    : undefined

  const sections: ParsedSection[] = []
  for (const block of blocks) {
    const lines = block.split("\n")
    // Drop leading/trailing blank lines around a block.
    while (lines.length && lines[0].trim() === "") lines.shift()
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop()
    if (lines.length === 0) continue
    const label = lines[0].trim()
    const lyrics = lines
      .slice(1)
      .join("\n")
      .replace(/^##.*$/gm, "") // strip SongBeamer slide-directive lines
      .trim()
    sections.push({ type: inferSectionType(label), label, lyrics })
  }

  return { title, authors, ccliNumber, copyright, key, sections, verseOrder }
}
