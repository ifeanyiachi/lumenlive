import {
  inferSectionType,
  isHeaderLine,
  normalizeHeaderLabel,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * Plain-text importer (P0) — the universal fallback. Blank lines separate
 * blocks; a block whose first line is a section header ("Verse 1", "Chorus")
 * becomes that section, otherwise the block is an auto-numbered verse. The title
 * comes from the caller (filename or a Paste dialog), since plain text carries no
 * reliable title marker.
 */
export function parsePlainText(
  text: string,
  fallbackTitle = "Untitled Song"
): ParsedSong {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)

  const sections: ParsedSection[] = []
  let verseCount = 0

  for (const block of blocks) {
    const lines = block.split("\n")
    if (isHeaderLine(lines[0])) {
      const label = normalizeHeaderLabel(lines[0])
      sections.push({
        type: inferSectionType(label),
        label,
        lyrics: lines.slice(1).join("\n").trim(),
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

  return { title: fallbackTitle, sections }
}
