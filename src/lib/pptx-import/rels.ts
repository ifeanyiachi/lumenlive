// ── Relationship (.rels) resolution ──────────────────────────────────────────

/** Parse a `.rels` part into an id→target map (targets normalized to full paths). */
export function parseRels(
  doc: Document | null,
  basePath: string
): Map<string, string> {
  const map = new Map<string, string>()
  if (!doc) return map
  for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
    const id = rel.getAttribute("Id")
    const target = rel.getAttribute("Target")
    if (id && target) map.set(id, resolvePath(basePath, target))
  }
  return map
}

/** Resolve a possibly-relative OOXML target against the referring part's dir. */
function resolvePath(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1)
  const baseDir = fromPart.includes("/")
    ? fromPart.slice(0, fromPart.lastIndexOf("/"))
    : ""
  const segments = (baseDir ? `${baseDir}/${target}` : target).split("/")
  const out: string[] = []
  for (const seg of segments) {
    if (seg === "..") out.pop()
    else if (seg !== "." && seg !== "") out.push(seg)
  }
  return out.join("/")
}

/** Path of the `.rels` part for a given part (e.g. slides/slide1.xml). */
export function relsPathFor(partPath: string): string {
  const dir = partPath.includes("/")
    ? partPath.slice(0, partPath.lastIndexOf("/"))
    : ""
  const file = partPath.slice(partPath.lastIndexOf("/") + 1)
  return dir ? `${dir}/_rels/${file}.rels` : `_rels/${file}.rels`
}

/** Find the first relationship target whose type ends with `typeName`. */
export function findByType(
  rels: Map<string, string>,
  typeName: string
): string | undefined {
  // parseRels drops the Type, so match on the conventional path segment instead.
  for (const target of rels.values()) {
    if (target.includes(`/${typeName}s/`) || target.includes(`/${typeName}/`))
      return target
  }
  return undefined
}
