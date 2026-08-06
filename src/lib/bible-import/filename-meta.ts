/**
 * Derive a sensible default translation code + title from an imported file's
 * name, so the import dialog can prefill them (still editable) instead of making
 * the user type everything. Pure and path-agnostic — strips any directory and
 * extension, then makes a friendly guess.
 *
 * Heuristics:
 *  - `nkjv.csv`               → { abbreviation: "NKJV",  title: "NKJV" }
 *  - `new-king-james.txt`     → { abbreviation: "NKJ",   title: "New King James" }
 *  - `web_bible.sqlite`       → { abbreviation: "WB",    title: "Web Bible" }
 *
 * A single token is treated as an abbreviation (uppercased for both fields);
 * multiple words become a Title-Cased name plus an initialism.
 */
export function deriveMetaFromFileName(fileName: string): {
  abbreviation: string
  title: string
} {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const stem = base.replace(/\.[^.]+$/, "").trim()
  const words = stem.split(/[\s_-]+/).filter(Boolean)

  if (words.length === 0) {
    return { abbreviation: "", title: "" }
  }

  if (words.length === 1) {
    const code = words[0]
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 12)
    return { abbreviation: code, title: code }
  }

  const title = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
  const initials = words
    .map((w) => w[0])
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12)
  const abbreviation =
    initials.length >= 2
      ? initials
      : words[0]
          .replace(/[^a-zA-Z0-9]/g, "")
          .toUpperCase()
          .slice(0, 12)

  return { abbreviation, title }
}
