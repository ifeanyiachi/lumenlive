import { firstChild, firstDesc } from "./xml"
import { readXfrm, type Xfrm } from "./geometry"
import { resolveColor, type ThemeColors } from "./colors"

// ── Placeholder geometry inheritance ─────────────────────────────────────────

/** A placeholder's inherited geometry, keyed by `${type}:${idx}`. */
export type PlaceholderMap = Map<string, Xfrm>

/** Build a placeholder-geometry map from a layout/master shape tree. */
export function buildPlaceholderMap(doc: Document | null): PlaceholderMap {
  const map: PlaceholderMap = new Map()
  if (!doc) return map
  const tree = doc.getElementsByTagName("p:spTree").item(0)
  if (!tree) return map
  for (const sp of Array.from(tree.getElementsByTagName("p:sp"))) {
    const ph = firstDesc(sp, "p:ph")
    if (!ph) continue
    const xfrm = readXfrm(firstChild(sp, "p:spPr"))
    if (!xfrm) continue
    const type = ph.getAttribute("type") ?? "body"
    const idx = ph.getAttribute("idx") ?? ""
    map.set(`${type}:${idx}`, xfrm)
  }
  return map
}

/** Resolve a placeholder's geometry from the layout, then the master. */
export function resolvePlaceholderXfrm(
  ph: Element,
  layout: PlaceholderMap,
  master: PlaceholderMap
): Xfrm | null {
  const type = ph.getAttribute("type") ?? "body"
  const idx = ph.getAttribute("idx") ?? ""
  const key = `${type}:${idx}`
  return (
    layout.get(key) ??
    master.get(key) ??
    layout.get(`${type}:`) ??
    master.get(`${type}:`) ??
    null
  )
}

// ── Placeholder text-style inheritance ───────────────────────────────────────

/**
 * Default run styling inherited by placeholder text from the master's
 * `<p:txStyles>` level-1 paragraph defaults. A title placeholder with no
 * explicit `<a:rPr>` inherits `title`; body/content placeholders inherit
 * `body`; everything else `other`. Any field may be null (not specified).
 */
export interface TxStyle {
  /** Size in OOXML hundredths of a point. */
  sizePt: number | null
  color: string | null
  bold: boolean | null
  font: string | null
}

export interface TxStyleMap {
  title: TxStyle
  body: TxStyle
  other: TxStyle
}

/** The master's default level-1 run styling for one style block. */
function lvl1DefStyle(
  style: Element | null,
  theme: ThemeColors,
  clrMap: Map<string, string>
): TxStyle {
  const empty: TxStyle = { sizePt: null, color: null, bold: null, font: null }
  if (!style) return empty
  const lvl1 = firstChild(style, "a:lvl1pPr")
  const defRPr = lvl1 ? firstChild(lvl1, "a:defRPr") : null
  if (!defRPr) return empty
  const sz = Number(defRPr.getAttribute("sz"))
  const b = defRPr.getAttribute("b")
  const latin = firstChild(defRPr, "a:latin")
  return {
    sizePt: Number.isFinite(sz) && sz > 0 ? sz : null,
    color: resolveColor(firstChild(defRPr, "a:solidFill"), theme, clrMap),
    bold: b === null ? null : b === "1",
    font: latin?.getAttribute("typeface") ?? null,
  }
}

/** Parse the master's `<p:txStyles>` into per-family default styling. */
export function parseTxStyles(
  masterDoc: Document | null,
  theme: ThemeColors,
  clrMap: Map<string, string>
): TxStyleMap {
  const empty: TxStyle = { sizePt: null, color: null, bold: null, font: null }
  if (!masterDoc) return { title: empty, body: empty, other: empty }
  const txStyles = masterDoc.getElementsByTagName("p:txStyles").item(0)
  if (!txStyles) return { title: empty, body: empty, other: empty }
  return {
    title: lvl1DefStyle(firstChild(txStyles, "p:titleStyle"), theme, clrMap),
    body: lvl1DefStyle(firstChild(txStyles, "p:bodyStyle"), theme, clrMap),
    other: lvl1DefStyle(firstChild(txStyles, "p:otherStyle"), theme, clrMap),
  }
}

/** Pick the inherited default style for a placeholder by its `type`. */
export function txStyleFor(ph: Element, styles: TxStyleMap): TxStyle {
  const type = ph.getAttribute("type") ?? "body"
  if (type === "title" || type === "ctrTitle") return styles.title
  // subTitle, body, and idx-only content placeholders all follow bodyStyle;
  // anything else (footers, dates, …) follows otherStyle.
  if (type === "subTitle" || type === "body") return styles.body
  return ph.getAttribute("idx") ? styles.body : styles.other
}
