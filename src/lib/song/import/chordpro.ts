import {
  inferSectionType,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * ChordPro importer (P1) — lyrics-only. Inline chords in `[...]` are stripped.
 * Directives set metadata (`{title}`, `{artist}`, `{key}`, `{copyright}`,
 * `{ccli}`) and open/close labelled sections (`{start_of_verse}`…`{end_of_verse}`
 * and the `sov/soc/sob` short forms; `{comment}` / `{c}` act as a section label).
 * Lines outside any environment collect into auto-numbered verses, split on blank
 * lines.
 */

const CHORD_RE = /\[[^\]]*\]/g

export function parseChordPro(text: string): ParsedSong {
  const lines = text.replace(/\r\n/g, "\n").split("\n")

  let title = "Untitled Song"
  const authors: string[] = []
  let key: string | undefined
  let copyright: string | undefined
  let ccliNumber: string | undefined

  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null
  let currentImplicit = false
  let autoVerse = 0

  const pushCurrent = () => {
    if (current) {
      current.lyrics = current.lyrics.replace(/\n{3,}/g, "\n\n").trim()
      sections.push(current)
      current = null
      currentImplicit = false
    }
  }

  const openSection = (type: ParsedSection["type"], label: string) => {
    pushCurrent()
    current = { type, label, lyrics: "" }
    currentImplicit = false
  }

  for (const raw of lines) {
    const directive = raw
      .trim()
      .match(/^\{\s*([a-zA-Z_0-9]+)\s*:?\s*([\s\S]*?)\s*\}$/)
    if (directive) {
      const name = directive[1].toLowerCase()
      const value = directive[2].trim()
      switch (name) {
        case "title":
        case "t":
          if (value) title = value
          break
        case "artist":
        case "subtitle":
        case "st":
          if (value)
            authors.push(
              ...value
                .split(/[,;/]|\band\b/i)
                .map((a) => a.trim())
                .filter(Boolean)
            )
          break
        case "key":
          if (value) key = value
          break
        case "copyright":
          if (value) copyright = value
          break
        case "ccli":
          if (value) ccliNumber = value
          break
        case "start_of_verse":
        case "sov":
          openSection("verse", value || `Verse ${++autoVerse}`)
          break
        case "start_of_chorus":
        case "soc":
          openSection("chorus", value || "Chorus")
          break
        case "start_of_bridge":
        case "sob":
          openSection("bridge", value || "Bridge")
          break
        case "start_of_part":
        case "sop":
          openSection(
            value ? inferSectionType(value) : "custom",
            value || "Section"
          )
          break
        case "comment":
        case "c":
        case "ci":
          if (value) openSection(inferSectionType(value), value)
          break
        case "end_of_verse":
        case "eov":
        case "end_of_chorus":
        case "eoc":
        case "end_of_bridge":
        case "eob":
        case "end_of_part":
        case "eop":
          pushCurrent()
          break
        default:
          break
      }
      continue
    }

    const line = raw.replace(CHORD_RE, "").replace(/\s+$/, "")
    if (line.trim() === "") {
      // Blank line closes an implicit (unlabelled) verse; inside a labelled
      // section it becomes a stanza break.
      if (currentImplicit) pushCurrent()
      else if (current) current.lyrics += "\n"
      continue
    }

    if (!current) {
      current = { type: "verse", label: `Verse ${++autoVerse}`, lyrics: "" }
      currentImplicit = true
    }
    current.lyrics = current.lyrics
      ? `${current.lyrics}\n${line.trim()}`
      : line.trim()
  }

  pushCurrent()

  return { title, authors, key, copyright, ccliNumber, sections }
}
