import type JSZip from "jszip"

// ── XML / DOM helpers ────────────────────────────────────────────────────────
//
// Thin wrappers over the browser's DOMParser used across the pptx importer.
// `parseXml` parses a part's text into a Document; the `firstChild`/`firstDesc`/
// `childrenByTag` helpers query by *qualified* tag name (namespace prefix
// included, e.g. "a:xfrm") since the OOXML parts are namespaced.

const parser = new DOMParser()

export function parseXml(text: string): Document {
  return parser.parseFromString(text, "application/xml")
}

/** Direct child elements of `el` whose qualified tag name equals `tag`. */
export function childrenByTag(el: Element | null, tag: string): Element[] {
  if (!el) return []
  const out: Element[] = []
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) out.push(child)
  }
  return out
}

/** First descendant (any depth) with the given qualified tag name. */
export function firstDesc(el: Element | null, tag: string): Element | null {
  return el ? el.getElementsByTagName(tag).item(0) : null
}

/** First direct child with the given qualified tag name. */
export function firstChild(el: Element | null, tag: string): Element | null {
  return childrenByTag(el, tag)[0] ?? null
}

export async function readXml(
  zip: JSZip,
  path: string
): Promise<Document | null> {
  const file = zip.file(path)
  if (!file) return null
  return parseXml(await file.async("text"))
}
