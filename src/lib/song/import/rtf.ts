/**
 * Minimal RTF → plain-text extractor, shared by the ProPresenter and (future)
 * EasyWorship importers whose lyrics are stored as RTF. Pure and dependency-free
 * — a compact port of the well-known RTF-strip algorithm: it walks control
 * words, skips ignorable destination groups (font/colour tables, etc.), decodes
 * `\'hh` and `\uN` characters, and maps `\par`/`\line` to newlines.
 */

const DESTINATIONS = new Set([
  "fonttbl",
  "colortbl",
  "stylesheet",
  "info",
  "generator",
  "datastore",
  "themedata",
  "colorschememapping",
  "latentstyles",
  "rsidtbl",
  "pict",
  "object",
  "listtable",
  "listoverridetable",
])

const SPECIAL: Record<string, string> = {
  par: "\n",
  sect: "\n",
  line: "\n",
  tab: "\t",
  emdash: "—",
  endash: "–",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
  bullet: "•",
}

const TOKEN =
  /\\([a-z]{1,32})(-?\d{1,10})? ?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|[\r\n]+|(.)/gi

export function stripRtf(rtf: string): string {
  if (!rtf.includes("\\")) return rtf.trim()

  const out: string[] = []
  const stack: { ucskip: number; ignorable: boolean }[] = []
  let ucskip = 1
  let curskip = 0
  let ignorable = false

  let m: RegExpExecArray | null
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(rtf)) !== null) {
    const [, word, arg, hex, ctrl, brace, char] = m
    if (brace) {
      if (brace === "{") {
        stack.push({ ucskip, ignorable })
      } else {
        const prev = stack.pop()
        if (prev) {
          ucskip = prev.ucskip
          ignorable = prev.ignorable
        }
      }
    } else if (ctrl) {
      // Control symbol: \\, \{, \}, \*, \~, \-, escaped newline…
      if (ctrl === "~") {
        if (!ignorable) out.push(" ")
      } else if (ctrl === "*") {
        ignorable = true
      } else if ("{}\\".includes(ctrl)) {
        if (!ignorable) out.push(ctrl)
      } else if (ctrl === "\n" || ctrl === "\r") {
        if (!ignorable) out.push("\n")
      }
    } else if (word) {
      curskip = 0
      if (DESTINATIONS.has(word)) {
        ignorable = true
      } else if (word === "uc") {
        ucskip = Number(arg) || 1
      } else if (word === "u") {
        let code = Number(arg)
        if (code < 0) code += 65536
        if (!ignorable) out.push(String.fromCharCode(code))
        curskip = ucskip
      } else if (word in SPECIAL) {
        if (!ignorable) out.push(SPECIAL[word])
      }
      // Any other control word carries no text — ignore it.
    } else if (hex) {
      if (curskip > 0) curskip -= 1
      else if (!ignorable) out.push(String.fromCharCode(parseInt(hex, 16)))
    } else if (char !== undefined) {
      if (curskip > 0) curskip -= 1
      else if (!ignorable) out.push(char)
    }
  }

  return out
    .join("")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Decode base64 (ProPresenter stores its RTF base64-encoded). */
export function decodeBase64(b64: string): string {
  const clean = b64.replace(/\s+/g, "")
  if (typeof atob === "function") return atob(clean)
  return ""
}
