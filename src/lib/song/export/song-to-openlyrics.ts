import type { Song, SongSection, SongSectionType } from "@/types/song"

/**
 * Serialise a `Song` to OpenLyrics 0.9 XML — the recommended canonical export
 * (design doc §6). Pure and dependency-free: sections become named `<verse>`
 * elements (`v1`, `c1`, `b1`…), stanzas become `<lines>` with `<br/>` breaks, and
 * the default arrangement becomes `<verseOrder>`, so the round-trip back through
 * `parseOpenLyrics` preserves titles, metadata, sections, and order.
 */

const CODE_BY_TYPE: Record<SongSectionType, string> = {
  verse: "v",
  chorus: "c",
  bridge: "b",
  pre_chorus: "p",
  intro: "i",
  ending: "e",
  tag: "t",
  interlude: "o",
  custom: "o",
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Assign each section a unique OpenLyrics verse name (v1, v2, c1, …). */
function assignNames(sections: SongSection[]): Map<string, string> {
  const counts = new Map<string, number>()
  const names = new Map<string, string>()
  for (const section of sections) {
    const code = CODE_BY_TYPE[section.type] ?? "o"
    const n = (counts.get(code) ?? 0) + 1
    counts.set(code, n)
    names.set(section.id, `${code}${n}`)
  }
  return names
}

function sectionToXml(section: SongSection, name: string): string {
  const stanzas = section.lyrics
    .split(/\n[ \t]*\n+/)
    .map((stanza) =>
      stanza
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    )
    .filter((lines) => lines.length > 0)

  const lineBlocks =
    stanzas.length > 0
      ? stanzas
          .map(
            (lines) =>
              `      <lines>${lines.map(escapeXml).join("<br/>")}</lines>`
          )
          .join("\n")
      : "      <lines></lines>"

  return `    <verse name="${name}">\n${lineBlocks}\n    </verse>`
}

export function songToOpenLyrics(song: Song): string {
  const names = assignNames(song.sections)

  const props: string[] = [
    `    <titles><title>${escapeXml(song.title)}</title></titles>`,
  ]
  if (song.authors.length > 0) {
    props.push(
      `    <authors>${song.authors
        .map((a) => `<author>${escapeXml(a)}</author>`)
        .join("")}</authors>`
    )
  }
  if (song.copyright)
    props.push(`    <copyright>${escapeXml(song.copyright)}</copyright>`)
  if (song.ccliNumber)
    props.push(`    <ccliNo>${escapeXml(song.ccliNumber)}</ccliNo>`)
  if (song.publisher)
    props.push(`    <publisher>${escapeXml(song.publisher)}</publisher>`)
  if (song.year) props.push(`    <released>${escapeXml(song.year)}</released>`)
  if (song.key) props.push(`    <key>${escapeXml(song.key)}</key>`)
  if (song.themes.length > 0) {
    props.push(
      `    <themes>${song.themes
        .map((t) => `<theme>${escapeXml(t)}</theme>`)
        .join("")}</themes>`
    )
  }

  const defaultArrangement =
    song.arrangements.find((a) => a.isDefault) ?? song.arrangements[0]
  const order = (defaultArrangement?.sectionIds ?? [])
    .map((id) => names.get(id))
    .filter((n): n is string => Boolean(n))
  if (order.length > 0) {
    props.push(`    <verseOrder>${order.join(" ")}</verseOrder>`)
  }

  const verses = song.sections
    .map((section) => sectionToXml(section, names.get(section.id) ?? "v1"))
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties>
${props.join("\n")}
  </properties>
  <lyrics>
${verses}
  </lyrics>
</song>
`
}
