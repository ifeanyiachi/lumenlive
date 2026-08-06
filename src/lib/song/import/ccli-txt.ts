import {
  inferSectionType,
  isHeaderLine,
  normalizeHeaderLabel,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * CCLI SongSelect `.txt` importer (P1). The canonical shape is a "CCLI Song #"
 * line, the title, then section blocks (header + lyrics), ending with copyright /
 * "CCLI License #" metadata. We read the CCLI number and copyright, take the
 * title from just after the "CCLI Song #" line, and stop collecting sections at
 * the trailing metadata block.
 */

const META_RE = /^(ccli\b|©|\(c\)|copyright\b)/i

export function parseCcliTxt(text: string): ParsedSong {
  const norm = text.replace(/\r\n/g, "\n")
  const lines = norm.split("\n")

  const ccliNumber = norm.match(/CCLI Song #\s*(\d+)/i)?.[1]
  const copyright = norm
    .match(/^\s*(?:©|\(c\)|Copyright)\s*(.+)$/im)?.[1]
    ?.trim()

  // Title: the first non-empty line after "CCLI Song #", else the first
  // non-empty, non-metadata line.
  let title = "Untitled Song"
  const songLineIdx = lines.findIndex((l) => /CCLI Song #/i.test(l))
  if (songLineIdx >= 0) {
    for (let i = songLineIdx + 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        title = lines[i].trim()
        break
      }
    }
  } else {
    const first = lines.find((l) => l.trim() && !META_RE.test(l.trim()))
    if (first) title = first.trim()
  }

  const blocks = norm
    .split(/\n[ \t]*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const sections: ParsedSection[] = []
  let verseCount = 0

  for (const block of blocks) {
    const blockLines = block.split("\n")
    const firstLine = blockLines[0].trim()

    if (/CCLI Song #/i.test(firstLine)) continue // top metadata/title block
    if (META_RE.test(firstLine)) continue // trailing metadata block
    if (blockLines.length === 1 && firstLine === title) continue // stray title line

    if (isHeaderLine(firstLine)) {
      const label = normalizeHeaderLabel(firstLine)
      sections.push({
        type: inferSectionType(label),
        label,
        lyrics: blockLines.slice(1).join("\n").trim(),
      })
    } else {
      verseCount += 1
      sections.push({
        type: "verse",
        label: `Verse ${verseCount}`,
        lyrics: block,
      })
    }
  }

  return { title, ccliNumber, copyright, sections }
}
