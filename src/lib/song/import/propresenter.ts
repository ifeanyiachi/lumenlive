import {
  decodeXmlEntities,
  inferSectionType,
  type ParsedSong,
  type ParsedSection,
} from "./normalize"
import { stripRtf, decodeBase64 } from "./rtf"

/**
 * ProPresenter 4–6 (`.pro4`/`.pro5`/`.pro6`) importer (P3). These are UTF-8 XML:
 * CCLI metadata sits on the root `RVPresentationDocument` element, and each
 * slide's lyrics are base64-encoded RTF inside a `RVTextElement`'s `RTFData`
 * field. Slides are grouped by `RVSlideGrouping` (Verse 1, Chorus…). Pro7's
 * protobuf format is not covered (it needs a binary decoder).
 */
function rootAttr(root: string, name: string): string | undefined {
  const v = root.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1]
  return v ? decodeXmlEntities(v).trim() : undefined
}

/** Decode every RTFData base64 blob within `block`, in document order. */
function rtfStanzas(block: string): string[] {
  const re = /rvXMLIvarName="RTFData"[^>]*>\s*([A-Za-z0-9+/=\s]*?)\s*</gi
  const stanzas: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const b64 = m[1].replace(/\s+/g, "")
    if (!b64) continue
    const text = stripRtf(decodeBase64(b64))
    if (text.trim()) stanzas.push(text)
  }
  return stanzas
}

export function parsePropresenter(xml: string): ParsedSong {
  const root = xml.match(/<RVPresentationDocument\b([^>]*)>/i)?.[1] ?? ""
  const title = rootAttr(root, "CCLISongTitle") ?? "Untitled Song"
  const authorRaw = rootAttr(root, "CCLIAuthor")
  const authors = authorRaw
    ? authorRaw
        .split(/[,;/]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean)
    : []
  const publisher = rootAttr(root, "CCLIPublisher")
  const year = rootAttr(root, "CCLICopyrightYear")
  const ccliNumber = rootAttr(root, "CCLISongNumber")

  const sections: ParsedSection[] = []
  const groupRe = /<RVSlideGrouping\b([^>]*)>([\s\S]*?)<\/RVSlideGrouping>/gi
  let g: RegExpExecArray | null
  let count = 0
  while ((g = groupRe.exec(xml)) !== null) {
    const name = g[1].match(/\bname="([^"]*)"/i)?.[1]?.trim()
    const stanzas = rtfStanzas(g[2])
    if (stanzas.length === 0) continue
    count += 1
    const label =
      name && name.length > 0 ? decodeXmlEntities(name) : `Verse ${count}`
    sections.push({
      type: inferSectionType(label),
      label,
      lyrics: stanzas.join("\n\n"),
    })
  }

  // Fallback: a flat document with no groupings — treat each RTF blob as a verse.
  if (sections.length === 0) {
    rtfStanzas(xml).forEach((text, i) =>
      sections.push({ type: "verse", label: `Verse ${i + 1}`, lyrics: text })
    )
  }

  return { title, authors, publisher, year, ccliNumber, sections }
}
