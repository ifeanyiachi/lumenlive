import {
  inferSectionType,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"

/**
 * Legacy CCLI SongSelect `.usr` importer (P2). An INI-like key=value file where
 * `Fields` lists section labels and `Words` lists their bodies, both delimited by
 * `/t`; within a body `/n` is a line break. `|` separates multiple authors /
 * copyright holders.
 */
export function parseCcliUsr(text: string): ParsedSong {
  const norm = text.replace(/\r\n/g, "\n")
  const values = new Map<string, string>()
  for (const line of norm.split("\n")) {
    const m = line.match(/^([A-Za-z]\w*)=(.*)$/)
    if (m) values.set(m[1].toLowerCase(), m[2])
  }

  const title = values.get("title")?.trim() || "Untitled Song"
  const authors = (values.get("author") ?? "")
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean)
  const copyright =
    values
      .get("copyright")
      ?.split("|")
      .map((c) => c.trim())
      .join(", ") || undefined
  const themes = (values.get("themes") ?? "")
    .split("/t")
    .map((t) => t.trim())
    .filter(Boolean)
  const ccliNumber = norm.match(/\[S\s+A?(\d+)\]/i)?.[1]

  const fields = (values.get("fields") ?? "")
    .split("/t")
    .map((f) => f.trim())
    .filter(Boolean)
  const bodies = (values.get("words") ?? "").split("/t")

  const sections: ParsedSection[] = fields.map((label, i) => ({
    type: inferSectionType(label),
    label,
    lyrics: (bodies[i] ?? "")
      .split("/n")
      .map((l) => l.trim())
      .join("\n")
      .trim(),
  }))

  return {
    title,
    authors,
    copyright,
    ccliNumber,
    themes: themes.length ? themes : undefined,
    sections,
  }
}
