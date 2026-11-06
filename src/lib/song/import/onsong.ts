import {
  inferSectionType,
  type ParsedSection,
  type ParsedSong,
} from "./normalize"

/**
 * OnSong importer (P1) — lyrics-only. OnSong is a ChordPro cousin used widely by
 * worship teams (e.g. the mattgraham/worship collection). Layout:
 *
 *   Title: 10,000 Reasons
 *   Artist: Matt Redman & Jonas Myrin
 *   Key: [G]
 *   CCLI: 6016351
 *
 *   Chorus:
 *   Bless the[C] Lord, O my[G] soul
 *
 *   Verse 1:
 *   The[C] sun comes[G] up
 *
 * A metadata header of `Key: value` lines precedes the body; a **section
 * header** is a label line ending in a colon with *nothing after it*
 * (`Chorus:`), which cleanly distinguishes it from a metadata line (which always
 * carries a value). Chords are inline in `[...]` and stripped for lyrics-only,
 * and chord/beat-only lines (`[Bm] // [A] ///`) — intros, turnarounds — collapse
 * to nothing, so instrumental sections drop out.
 */

const CHORD_RE = /\[[^\]]*\]/g
/** After chords are stripped, a line of only beat scaffolding (slashes, bars,
 * dots, spaces) is an instrumental line with no lyrics. */
const BEAT_ONLY_RE = /^[\s/|.]*$/
/** A section header: a label ending in a colon with nothing after it. */
const SECTION_RE = /^([^[\]{}:]+?)\s*:\s*$/
/** A `Key: value` line in the header (value may be empty, e.g. `Artist:`). */
const META_ANY = /^([A-Za-z][^:]*?)\s*:\s*(.*)$/
/** Labels that name a song section (used to detect a header with no trailing
 * blank line, so an empty-value section label isn't eaten as metadata). */
const SECTION_KEYWORD_RE =
  /^(verse|chorus|bridge|pre[-\s]?chorus|intro|outro|ending|tag|interlude|instrumental|refrain|vamp|turnaround|coda|reprise|hook|breakdown|channel)\b/i

/** Strip a trailing repeat marker ("Instrumental x2" → "Instrumental"). */
function cleanLabel(label: string): string {
  return (
    label
      .trim()
      .replace(/\s*\(?x\s*\d+\)?$/i, "")
      .trim() || label.trim()
  )
}

export function parseOnsong(text: string): ParsedSong {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")

  let title = ""
  const authors: string[] = []
  let key: string | undefined
  let copyright: string | undefined
  let ccliNumber: string | undefined
  let year: string | undefined
  let verseOrder: string[] | undefined

  const sections: ParsedSection[] = []
  let current: ParsedSection | null = null
  // True when `current` was auto-created for label-less lyrics: a blank line then
  // closes it so stanzas become separate verses (as the ChordPro parser does).
  let currentImplicit = false
  let autoVerse = 0
  let inHeader = true
  let sawContent = false

  const pushCurrent = () => {
    if (current) {
      current.lyrics = current.lyrics.replace(/\n{3,}/g, "\n\n").trim()
      if (current.lyrics) sections.push(current)
      current = null
      currentImplicit = false
    }
  }

  const openSection = (label: string) => {
    pushCurrent()
    current = { type: inferSectionType(label), label, lyrics: "" }
    currentImplicit = false
  }

  const addLyric = (line: string) => {
    if (!current) {
      current = { type: "verse", label: `Verse ${++autoVerse}`, lyrics: "" }
      currentImplicit = true
    }
    current.lyrics = current.lyrics ? `${current.lyrics}\n${line}` : line
  }

  /**
   * A blank or instrumental line: inside a labelled section it's a stanza break;
   * inside an auto-created (implicit) verse it closes the verse so the next
   * stanza starts a new one.
   */
  const addBreak = () => {
    if (!current) return
    if (currentImplicit) pushCurrent()
    else current.lyrics += "\n"
  }

  const handleMeta = (field: string, valueRaw: string) => {
    const f = field.trim().toLowerCase()
    const v = valueRaw.trim()
    if (!v) return
    if (f === "title") title = v
    else if (f === "artist" || f === "author" || f === "authors" || f === "by")
      authors.push(
        ...v
          .split(/[,;/&]|\band\b/i)
          .map((a) => a.trim())
          .filter(Boolean)
      )
    else if (f === "key") key = v.replace(/[[\]]/g, "")
    else if (f === "copyright") copyright = v
    else if (f.startsWith("ccli")) ccliNumber = v.replace(/[^0-9]/g, "") || v
    else if (f === "year") year = v
    else if (f === "flow" || f === "presentation")
      verseOrder = v.split(/[\s,]+/).filter(Boolean)
    // All other keys (Tempo, Book, Notes, Scripture, Capo, Time…) are ignored.
  }

  for (const raw of lines) {
    const trimmed = raw.trim()

    if (inHeader) {
      if (trimmed === "") {
        // A blank line after any header content ends the header block.
        if (sawContent) inHeader = false
        continue
      }
      // A bare first line with no colon is the title (OnSong allows this).
      if (!sawContent && !trimmed.includes(":")) {
        title = trimmed
        sawContent = true
        continue
      }
      const meta = trimmed.match(META_ANY)
      if (meta) {
        const field = meta[1].trim()
        const value = meta[2]
        // Consume header metadata (including empty-value lines like `Artist:`).
        // The exception: an empty-value line naming a section (`Chorus:` with no
        // preceding blank line) is the first section — end the header for it.
        if (value.trim() !== "" || !SECTION_KEYWORD_RE.test(field)) {
          handleMeta(field, value)
          sawContent = true
          continue
        }
      }
      // A section header, lyric, or chord line — the body starts here.
      inHeader = false
    }

    if (trimmed === "") {
      addBreak()
      continue
    }

    const sec = trimmed.match(SECTION_RE)
    if (sec) {
      openSection(cleanLabel(sec[1]))
      continue
    }

    const stripped = raw.replace(CHORD_RE, "")
    if (stripped.trim() === "" || BEAT_ONLY_RE.test(stripped)) {
      // Chord/beat-only line → stanza break, no lyrics.
      addBreak()
      continue
    }
    addLyric(stripped.replace(/[ \t]{2,}/g, " ").trim())
  }

  pushCurrent()

  return {
    title: title || "Untitled Song",
    authors,
    key,
    copyright,
    ccliNumber,
    year,
    sections,
    verseOrder,
  }
}
