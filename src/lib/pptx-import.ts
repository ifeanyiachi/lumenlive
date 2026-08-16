import JSZip from "jszip"
import type {
  Presentation,
  Slide,
  SlideBackground,
  SlideElement,
  SlideImageElement,
  SlideTextElement,
} from "@/types/slide"
import { createDefaultSlide } from "@/lib/slide-defaults"

// ── PowerPoint (.pptx) import ────────────────────────────────────────────────
//
// A .pptx is a ZIP of Open XML parts. We parse it entirely in the frontend
// (mirroring the existing JSON import path) and map each slide to the app's
// Slide model. Scope: text boxes, pictures, and slide backgrounds — no charts,
// tables, SmartArt, animations, or grouped-shape coordinate remapping.
//
// Coordinate systems:
//   • PowerPoint positions/sizes are in EMU (914400 EMU = 1 inch). The Slide
//     model stores x/y/width/height as a percentage (0–100) of the slide, so we
//     divide by the slide's EMU dimensions.
//   • Font sizes in OOXML are in hundredths of a point. The renderer treats
//     `fontSize` as px on a nominal 1920×1080 canvas (`fontSize * canvasWidth/
//     1920`), i.e. px on a 1080-tall slide. So px = pt * 1080 / (72 *
//     slideHeightInches) = pt * (1080 * 12700 / slideHeightEmu).

const CANVAS_HEIGHT = 1080

/** Resolve extracted image bytes to a URL the Slide model can render. */
export type ImageResolver = (
  bytes: Uint8Array,
  fileName: string
) => Promise<string>

interface SlideSize {
  cx: number
  cy: number
}

/** A placeholder's inherited geometry, keyed by `${type}:${idx}`. */
type PlaceholderMap = Map<string, Xfrm>

interface Xfrm {
  x: number
  y: number
  cx: number
  cy: number
}

const parser = new DOMParser()

function parseXml(text: string): Document {
  return parser.parseFromString(text, "application/xml")
}

/** Direct child elements of `el` whose qualified tag name equals `tag`. */
function childrenByTag(el: Element | null, tag: string): Element[] {
  if (!el) return []
  const out: Element[] = []
  for (const child of Array.from(el.children)) {
    if (child.tagName === tag) out.push(child)
  }
  return out
}

/** First descendant (any depth) with the given qualified tag name. */
function firstDesc(el: Element | null, tag: string): Element | null {
  return el ? el.getElementsByTagName(tag).item(0) : null
}

/** First direct child with the given qualified tag name. */
function firstChild(el: Element | null, tag: string): Element | null {
  return childrenByTag(el, tag)[0] ?? null
}

/** Extract `<a:xfrm>` geometry (absolute EMU) from a shape's properties. */
function readXfrm(spPr: Element | null): Xfrm | null {
  if (!spPr) return null
  const xfrm = firstChild(spPr, "a:xfrm")
  if (!xfrm) return null
  const off = firstChild(xfrm, "a:off")
  const ext = firstChild(xfrm, "a:ext")
  if (!off || !ext) return null
  const x = Number(off.getAttribute("x"))
  const y = Number(off.getAttribute("y"))
  const cx = Number(ext.getAttribute("cx"))
  const cy = Number(ext.getAttribute("cy"))
  if (![x, y, cx, cy].every(Number.isFinite)) return null
  return { x, y, cx, cy }
}

function emuToPct(value: number, total: number): number {
  if (total <= 0) return 0
  return (value / total) * 100
}

/** Convert an OOXML point size (hundredths of a point) to model px. */
function ptToPx(hundredthsPt: number, slideCy: number): number {
  const pt = hundredthsPt / 100
  return (pt * CANVAS_HEIGHT * 12700) / slideCy
}

// ── Color resolution ─────────────────────────────────────────────────────────

/** Theme color scheme (dk1/lt1/accent1…) resolved to hex, keyed by scheme name. */
type ThemeColors = Map<string, string>

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex(n: number): string {
  return clamp8(n).toString(16).padStart(2, "0")
}

/** Apply OOXML lumMod/lumOff luminance modifiers to a hex color. */
function applyLumMods(
  hex: string,
  lumMod: number | null,
  lumOff: number | null
): string {
  if (lumMod === null && lumOff === null) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mod = lumMod ?? 1
  const off = lumOff ?? 0
  const adj = (c: number) => clamp8(c * mod + 255 * off)
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`
}

/**
 * Resolve a color container (`<a:solidFill>`, `<a:rPr>`, etc.) to a hex string.
 * Handles srgbClr, schemeClr (via theme + master color map), sysClr, and the
 * common lumMod/lumOff tint modifiers. Returns null if no color is present.
 */
function resolveColor(
  container: Element | null,
  theme: ThemeColors,
  clrMap: Map<string, string>
): string | null {
  if (!container) return null

  const srgb = firstDesc(container, "a:srgbClr")
  if (srgb) {
    const val = srgb.getAttribute("val")
    if (val)
      return applyLumMods(
        `#${val}`,
        readLum(srgb, "a:lumMod"),
        readLum(srgb, "a:lumOff")
      )
  }

  const scheme = firstDesc(container, "a:schemeClr")
  if (scheme) {
    let name = scheme.getAttribute("val") ?? ""
    // The master's clrMap remaps slide-facing names (bg1/tx1/…) to theme slots.
    name = clrMap.get(name) ?? name
    const hex = theme.get(name)
    if (hex)
      return applyLumMods(
        hex,
        readLum(scheme, "a:lumMod"),
        readLum(scheme, "a:lumOff")
      )
  }

  const sys = firstDesc(container, "a:sysClr")
  if (sys) {
    const last = sys.getAttribute("lastClr")
    if (last) return `#${last}`
  }

  return null
}

/**
 * Resolve a bare scheme-colour *name* (e.g. `tx1`, `bg1`, `accent1`) to hex via
 * the master's colour map then the theme. Used for values that aren't wrapped in
 * a colour container — chiefly the implicit `tx1` default a placeholder's text
 * takes when nothing sets an explicit colour.
 */
function resolveScheme(
  name: string,
  theme: ThemeColors,
  clrMap: Map<string, string>
): string | null {
  const mapped = clrMap.get(name) ?? name
  return theme.get(mapped) ?? null
}

function readLum(el: Element, tag: string): number | null {
  const node = firstDesc(el, tag)
  if (!node) return null
  const val = Number(node.getAttribute("val"))
  return Number.isFinite(val) ? val / 100000 : null
}

/** Parse `ppt/theme/themeN.xml` into a name→hex color map. */
function parseThemeColors(doc: Document | null): ThemeColors {
  const colors: ThemeColors = new Map()
  if (!doc) return colors
  const scheme = doc.getElementsByTagName("a:clrScheme").item(0)
  if (!scheme) return colors
  for (const child of Array.from(scheme.children)) {
    // e.g. <a:dk1><a:sysClr lastClr="000000"/></a:dk1>
    const name = child.tagName.replace(/^a:/, "")
    const srgb = firstChild(child, "a:srgbClr")
    const sys = firstChild(child, "a:sysClr")
    if (srgb?.getAttribute("val")) {
      colors.set(name, `#${srgb.getAttribute("val")}`)
    } else if (sys?.getAttribute("lastClr")) {
      colors.set(name, `#${sys.getAttribute("lastClr")}`)
    }
  }
  return colors
}

// ── Relationship (.rels) resolution ──────────────────────────────────────────

/** Parse a `.rels` part into an id→target map (targets normalized to full paths). */
function parseRels(
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

// ── Text extraction ──────────────────────────────────────────────────────────

interface RunStyle {
  /** null = not specified on the run, so an inherited default may apply. */
  bold: boolean | null
  italic: boolean
  underline: boolean
  color: string | null
  sizePt: number | null
  font: string | null
}

const ALIGN_MAP: Record<string, SlideTextElement["horizontalAlign"]> = {
  l: "left",
  ctr: "center",
  r: "right",
  just: "left",
}

interface ExtractedText {
  text: string
  align: SlideTextElement["horizontalAlign"]
  style: RunStyle
  /** Explicit paragraph bullet, if the first text paragraph sets one. */
  listType: SlideTextElement["listType"]
}

/**
 * Pull the plaintext plus a *representative* run style from a `<p:txBody>`.
 *
 * The Slide model carries one style per text box, so mixed inline formatting
 * can't be preserved verbatim. We pick the **dominant** run — the one with the
 * largest explicit point size (falling back to the first styled run) — because
 * a slide's headline run is what a viewer reads the box's size/weight/colour
 * from; letting a trailing empty or footnote run win looked "distorted".
 * Paragraphs join with newlines; per-paragraph alignment is taken from the
 * first paragraph that sets it, and an explicitly bulleted first paragraph
 * surfaces as the box's list type.
 */
function extractText(
  txBody: Element,
  theme: ThemeColors,
  clrMap: Map<string, string>
): ExtractedText | null {
  const paragraphs = childrenByTag(txBody, "a:p")
  const lines: string[] = []
  let align: SlideTextElement["horizontalAlign"] = "left"
  let alignSet = false
  let dominant: RunStyle | null = null
  let firstStyled: RunStyle | null = null
  let listType: SlideTextElement["listType"] = "none"
  let listTypeSet = false

  for (const p of paragraphs) {
    const pPr = firstChild(p, "a:pPr")
    if (pPr && !alignSet) {
      const algn = pPr.getAttribute("algn")
      if (algn && ALIGN_MAP[algn]) {
        align = ALIGN_MAP[algn]
        alignSet = true
      }
    }

    let lineText = ""
    for (const run of childrenByTag(p, "a:r")) {
      const t = firstChild(run, "a:t")
      if (t?.textContent) lineText += t.textContent
      const rs = readRunStyle(run, theme, clrMap)
      if (!firstStyled) firstStyled = rs
      // "Dominant" = largest explicit size seen so far.
      if (
        rs.sizePt !== null &&
        (dominant?.sizePt == null || rs.sizePt > dominant.sizePt)
      ) {
        dominant = rs
      }
    }

    // The first paragraph that actually contains text decides the box's bullet.
    if (!listTypeSet && lineText.trim()) {
      listType = paragraphBullet(pPr)
      listTypeSet = true
    }

    // A break-only paragraph (<a:br/>) or an empty paragraph still adds a line.
    lines.push(lineText)
  }

  const text = lines.join("\n").replace(/\n+$/, "")
  if (!text.trim()) return null

  return {
    text,
    align,
    style: dominant ?? firstStyled ?? emptyStyle(),
    listType,
  }
}

/**
 * Explicit list type from a paragraph's `<a:pPr>` bullet definition. Only
 * *explicit* bullets count (`<a:buChar>` / `<a:buAutoNum>` / `<a:buNone>`);
 * we deliberately do not inherit bullets from the master's list styles, so
 * un-bulleted content (e.g. song lyrics in a body placeholder whose template
 * happens to define bullets) is never given phantom bullets.
 */
function paragraphBullet(pPr: Element | null): SlideTextElement["listType"] {
  if (!pPr) return "none"
  if (firstChild(pPr, "a:buNone")) return "none"
  if (firstChild(pPr, "a:buAutoNum")) return "numbered"
  if (firstChild(pPr, "a:buChar")) return "bullet"
  return "none"
}

function emptyStyle(): RunStyle {
  return {
    bold: null,
    italic: false,
    underline: false,
    color: null,
    sizePt: null,
    font: null,
  }
}

function readRunStyle(
  run: Element,
  theme: ThemeColors,
  clrMap: Map<string, string>
): RunStyle {
  const rPr = firstChild(run, "a:rPr")
  if (!rPr) return emptyStyle()
  const sz = Number(rPr.getAttribute("sz"))
  const fill = firstChild(rPr, "a:solidFill")
  const latin = firstChild(rPr, "a:latin")
  const b = rPr.getAttribute("b")
  return {
    bold: b === null ? null : b === "1",
    italic: rPr.getAttribute("i") === "1",
    underline: !!rPr.getAttribute("u") && rPr.getAttribute("u") !== "none",
    color: resolveColor(fill, theme, clrMap),
    sizePt: Number.isFinite(sz) ? sz : null,
    font: latin?.getAttribute("typeface") ?? null,
  }
}

// ── Placeholder geometry inheritance ─────────────────────────────────────────

/** Build a placeholder-geometry map from a layout/master shape tree. */
function buildPlaceholderMap(doc: Document | null): PlaceholderMap {
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
function resolvePlaceholderXfrm(
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
function parseTxStyles(
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
function txStyleFor(ph: Element, styles: TxStyleMap): TxStyle {
  const type = ph.getAttribute("type") ?? "body"
  if (type === "title" || type === "ctrTitle") return styles.title
  // subTitle, body, and idx-only content placeholders all follow bodyStyle;
  // anything else (footers, dates, …) follows otherStyle.
  if (type === "subTitle" || type === "body") return styles.body
  return ph.getAttribute("idx") ? styles.body : styles.other
}

// ── Slide parsing ────────────────────────────────────────────────────────────

/**
 * Default run styling inherited by placeholder text from the master's
 * `<p:txStyles>` level-1 paragraph defaults. A title placeholder with no
 * explicit `<a:rPr>` inherits `title`; body/content placeholders inherit
 * `body`; everything else `other`. Any field may be null (not specified).
 */
interface TxStyle {
  /** Size in OOXML hundredths of a point. */
  sizePt: number | null
  color: string | null
  bold: boolean | null
  font: string | null
}

interface TxStyleMap {
  title: TxStyle
  body: TxStyle
  other: TxStyle
}

interface SlideContext {
  size: SlideSize
  theme: ThemeColors
  clrMap: Map<string, string>
  layoutPh: PlaceholderMap
  masterPh: PlaceholderMap
  slideRels: Map<string, string>
  /** Background resolved from the slide layout, if it defines one. */
  layoutBg: BgResult
  /** Background resolved from the slide master, if it defines one. */
  masterBg: BgResult
  /** Placeholder default text styles from the master's `<p:txStyles>`. */
  txStyles: TxStyleMap
  /** Implicit `tx1` text colour for placeholders that set none. */
  defaultTextColor: string | null
}

/** A picture / background image whose bytes are resolved to a URL post-parse. */
interface PendingImage {
  zipPath: string
  apply: (url: string) => void
}

/** A background either resolved to a fill, or pending an embedded image. */
type BgResult =
  | { kind: "fill"; bg: SlideBackground }
  | { kind: "image"; zipPath: string }
  | null

// ── Group coordinate transforms ──────────────────────────────────────────────
//
// A <p:grpSp> establishes a child coordinate space (chOff/chExt) mapped onto the
// group's placed rectangle (off/ext) on the parent surface; nested groups
// compose. We flatten everything to absolute slide-EMU before converting to the
// model's percentages, so grouped content lands where PowerPoint drew it instead
// of being dropped.

interface GroupTransform {
  ox: number
  oy: number
  sx: number
  sy: number
}

const IDENTITY_TF: GroupTransform = { ox: 0, oy: 0, sx: 1, sy: 1 }

/** Map a shape's local xfrm to absolute slide-EMU under `tf`. */
function applyTransform(xfrm: Xfrm, tf: GroupTransform): Xfrm {
  return {
    x: tf.ox + xfrm.x * tf.sx,
    y: tf.oy + xfrm.y * tf.sy,
    cx: xfrm.cx * tf.sx,
    cy: xfrm.cy * tf.sy,
  }
}

/**
 * Compose the child-space transform declared by a `<p:grpSp>` with the incoming
 * `parent` transform. Returns `parent` unchanged when the group carries no
 * usable xfrm, so its children keep the parent's mapping rather than vanishing.
 */
function composeGroupTransform(
  grpSp: Element,
  parent: GroupTransform
): GroupTransform {
  const grpSpPr = firstChild(grpSp, "p:grpSpPr")
  const xfrm = grpSpPr ? firstChild(grpSpPr, "a:xfrm") : null
  if (!xfrm) return parent
  const off = firstChild(xfrm, "a:off")
  const ext = firstChild(xfrm, "a:ext")
  const chOff = firstChild(xfrm, "a:chOff")
  const chExt = firstChild(xfrm, "a:chExt")
  if (!off || !ext || !chOff || !chExt) return parent
  const chCx = Number(chExt.getAttribute("cx"))
  const chCy = Number(chExt.getAttribute("cy"))
  if (!chCx || !chCy) return parent

  // Local transform: childCoord → this group's parent space.
  const sx = Number(ext.getAttribute("cx")) / chCx
  const sy = Number(ext.getAttribute("cy")) / chCy
  const ox =
    Number(off.getAttribute("x")) - Number(chOff.getAttribute("x")) * sx
  const oy =
    Number(off.getAttribute("y")) - Number(chOff.getAttribute("y")) * sy
  if (![sx, sy, ox, oy].every(Number.isFinite)) return parent

  // Apply local first, then the parent transform.
  return {
    ox: parent.ox + ox * parent.sx,
    oy: parent.oy + oy * parent.sy,
    sx: sx * parent.sx,
    sy: sy * parent.sy,
  }
}

/** Rotation in clockwise degrees from a shape's own `<a:xfrm rot="…">`, if set. */
function readRot(spPr: Element | null): number | undefined {
  const xfrm = spPr ? firstChild(spPr, "a:xfrm") : null
  const rot = Number(xfrm?.getAttribute("rot"))
  // OOXML `rot` is 60000ths of a degree, clockwise — as is the renderer.
  if (!Number.isFinite(rot) || rot === 0) return undefined
  return rot / 60000
}

async function parseSlide(
  zip: JSZip,
  slidePath: string,
  ctx: SlideContext
): Promise<{ slide: Slide; images: PendingImage[] }> {
  const xml = await readXml(zip, slidePath)
  const slide = createDefaultSlide()
  slide.elements = []
  const images: PendingImage[] = []

  const cSld = xml?.getElementsByTagName("p:cSld").item(0) ?? null
  // Background inheritance mirrors PowerPoint: a slide with no <p:bg> of its own
  // inherits the layout's, then the master's, before the app default.
  const slideBg = resolveBg(cSld, ctx.theme, ctx.clrMap, ctx.slideRels)
  slide.background = materializeBg(
    slideBg ?? ctx.layoutBg ?? ctx.masterBg,
    images
  )

  const tree = xml?.getElementsByTagName("p:spTree").item(0)
  if (tree) walkTree(tree, ctx, IDENTITY_TF, slide.elements, images)

  return { slide, images }
}

/** Recursively flatten a shape tree, descending into groups with their transform. */
function walkTree(
  tree: Element,
  ctx: SlideContext,
  tf: GroupTransform,
  elements: SlideElement[],
  images: PendingImage[]
): void {
  for (const node of Array.from(tree.children)) {
    if (node.tagName === "p:sp") {
      const el = parseShape(node, ctx, tf)
      if (el) elements.push(el)
    } else if (node.tagName === "p:pic") {
      const res = parsePicture(node, ctx, tf)
      if (res) {
        elements.push(res.element)
        images.push(res.pending)
      }
    } else if (node.tagName === "p:grpSp") {
      walkTree(node, ctx, composeGroupTransform(node, tf), elements, images)
    }
  }
}

function parseShape(
  sp: Element,
  ctx: SlideContext,
  tf: GroupTransform
): SlideTextElement | null {
  const txBody = firstDesc(sp, "p:txBody")
  if (!txBody) return null
  const extracted = extractText(txBody, ctx.theme, ctx.clrMap)
  if (!extracted) return null

  const spPr = firstChild(sp, "p:spPr")
  const ph = firstDesc(sp, "p:ph")
  let xfrm = readXfrm(spPr)
  if (!xfrm && ph) {
    xfrm = resolvePlaceholderXfrm(ph, ctx.layoutPh, ctx.masterPh)
  }
  // Fall back to a centered box when geometry can't be resolved at all.
  const geom = xfrm
    ? rectFromXfrm(applyTransform(xfrm, tf), ctx.size)
    : { x: 5, y: 5, width: 90, height: 90 }

  const { style } = extracted
  const inherited = ph ? txStyleFor(ph, ctx.txStyles) : null

  // Per-attribute precedence: the dominant run's explicit value, then the
  // placeholder's inherited default from <p:txStyles>, then a neutral fallback.
  const sizePt = style.sizePt ?? inherited?.sizePt ?? null
  const fontSize = sizePt !== null ? ptToPx(sizePt, ctx.size.cy) : 40
  const bold = style.bold ?? inherited?.bold ?? false
  const color =
    style.color ?? inherited?.color ?? ctx.defaultTextColor ?? "#ffffff"
  const fontFamily = style.font ?? inherited?.font ?? "Inter"

  // Vertical anchor from the body's <a:bodyPr anchor="…">.
  const bodyPr = firstDesc(txBody, "a:bodyPr")
  const anchor = bodyPr?.getAttribute("anchor")
  const verticalAlign: SlideTextElement["verticalAlign"] =
    anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top"

  // A shape fill behind the text maps to the text element's backgroundColor.
  const shapeFill = resolveColor(
    firstChild(spPr, "a:solidFill"),
    ctx.theme,
    ctx.clrMap
  )
  const rotation = readRot(spPr)
  const listType = extracted.listType

  return {
    id: crypto.randomUUID(),
    type: "text",
    text: extracted.text,
    ...geom,
    ...(rotation !== undefined ? { rotation } : {}),
    fontFamily,
    fontSize,
    fontWeight: bold ? 700 : 400,
    bold,
    italic: style.italic,
    underline: style.underline,
    color,
    horizontalAlign: extracted.align,
    verticalAlign,
    lineHeight: 1.2,
    textTransform: "none",
    ...(listType && listType !== "none" ? { listType } : {}),
    ...(shapeFill ? { backgroundColor: shapeFill } : {}),
  }
}

function parsePicture(
  pic: Element,
  ctx: SlideContext,
  tf: GroupTransform
): { element: SlideImageElement; pending: PendingImage } | null {
  const blip = firstDesc(pic, "a:blip")
  const embed = blip?.getAttribute("r:embed")
  if (!embed) return null
  const zipPath = ctx.slideRels.get(embed)
  if (!zipPath) return null

  const spPr = firstDesc(pic, "p:spPr")
  const xfrm = readXfrm(spPr)
  const geom = xfrm
    ? rectFromXfrm(applyTransform(xfrm, tf), ctx.size)
    : { x: 20, y: 20, width: 60, height: 60 }
  const rotation = readRot(spPr)

  const element: SlideImageElement = {
    id: crypto.randomUUID(),
    type: "image",
    imageUrl: "",
    ...geom,
    ...(rotation !== undefined ? { rotation } : {}),
    objectFit: "contain",
    opacity: 1,
    borderRadius: 0,
  }
  return {
    element,
    pending: { zipPath, apply: (url) => (element.imageUrl = url) },
  }
}

/** Turn a resolved/pending background into a concrete {@link SlideBackground}. */
function materializeBg(
  result: BgResult,
  images: PendingImage[]
): SlideBackground {
  if (!result) return { type: "solid", color: "#1a1a2e" }
  if (result.kind === "fill") return result.bg
  const bg: SlideBackground = { type: "image", imageUrl: "" }
  images.push({ zipPath: result.zipPath, apply: (url) => (bg.imageUrl = url) })
  return bg
}

function rectFromXfrm(xfrm: Xfrm, size: SlideSize) {
  return {
    x: emuToPct(xfrm.x, size.cx),
    y: emuToPct(xfrm.y, size.cy),
    width: emuToPct(xfrm.cx, size.cx),
    height: emuToPct(xfrm.cy, size.cy),
  }
}

/**
 * Resolve a background from a part's `<p:cSld>`: a solid/gradient/bgRef fill,
 * or an embedded picture (`<a:blipFill>`) surfaced as a pending image via the
 * part's own `rels`. Returns null when the part defines none, so the caller can
 * fall through the slide → layout → master → default inheritance chain. Takes
 * theme/color-map/rels directly rather than a full {@link SlideContext} so it
 * can also resolve layout/master backgrounds while the context is assembling.
 */
function resolveBg(
  cSld: Element | null,
  theme: ThemeColors,
  clrMap: Map<string, string>,
  rels: Map<string, string>
): BgResult {
  const bg = cSld ? firstChild(cSld, "p:bg") : null
  if (!bg) return null

  const bgPr = firstDesc(bg, "p:bgPr")
  if (bgPr) {
    const solid = firstChild(bgPr, "a:solidFill")
    const color = resolveColor(solid, theme, clrMap)
    if (color) return { kind: "fill", bg: { type: "solid", color } }

    const grad = parseGradient(firstChild(bgPr, "a:gradFill"), theme, clrMap)
    if (grad) return { kind: "fill", bg: grad }

    const blip = firstDesc(firstChild(bgPr, "a:blipFill"), "a:blip")
    const embed = blip?.getAttribute("r:embed")
    if (embed) {
      const zipPath = rels.get(embed)
      if (zipPath) return { kind: "image", zipPath }
    }
  }
  // <p:bgRef> pointing at a theme fill: resolve just its color override.
  const bgRef = firstChild(bg, "p:bgRef")
  if (bgRef) {
    const color = resolveColor(bgRef, theme, clrMap)
    if (color) return { kind: "fill", bg: { type: "solid", color } }
  }
  return null
}

/** Resolve a background from a whole layout/master document. */
function bgResultFromDoc(
  doc: Document | null,
  theme: ThemeColors,
  clrMap: Map<string, string>,
  rels: Map<string, string>
): BgResult {
  const cSld = doc?.getElementsByTagName("p:cSld").item(0) ?? null
  return resolveBg(cSld, theme, clrMap, rels)
}

function parseGradient(
  gradFill: Element | null,
  theme: ThemeColors,
  clrMap: Map<string, string>
): SlideBackground | null {
  if (!gradFill) return null
  const gsList = firstChild(gradFill, "a:gsLst")
  if (!gsList) return null
  const stops: { offset: number; color: string }[] = []
  for (const gs of childrenByTag(gsList, "a:gs")) {
    const pos = Number(gs.getAttribute("pos"))
    const color = resolveColor(gs, theme, clrMap)
    if (color)
      stops.push({
        offset: Number.isFinite(pos) ? pos / 100000 : stops.length,
        color,
      })
  }
  if (stops.length < 2) return null
  const lin = firstChild(gradFill, "a:lin")
  const angle = lin ? Number(lin.getAttribute("ang")) / 60000 : 90
  return {
    type: "gradient",
    gradient: {
      type: firstChild(gradFill, "a:path") ? "radial" : "linear",
      angle: Number.isFinite(angle) ? angle : 90,
      stops,
    },
  }
}

// ── Zip helpers ──────────────────────────────────────────────────────────────

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path)
  if (!file) return null
  return parseXml(await file.async("text"))
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"])

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Parse a `.pptx` archive into a {@link Presentation}. Extracted images are
 * handed to `resolveImage`, which persists them (or inlines them) and returns a
 * URL for the Slide model. Slides whose images fail to resolve keep an empty
 * imageUrl rather than aborting the whole import.
 */
export async function parsePptx(
  data: ArrayBuffer,
  fileName: string,
  resolveImage: ImageResolver
): Promise<Presentation> {
  const zip = await JSZip.loadAsync(data)

  const presDoc = await readXml(zip, "ppt/presentation.xml")
  if (!presDoc)
    throw new Error("Not a valid .pptx file (missing presentation.xml)")

  // Slide dimensions (EMU).
  const sldSz = presDoc.getElementsByTagName("p:sldSz").item(0)
  const size: SlideSize = {
    cx: Number(sldSz?.getAttribute("cx")) || 12192000,
    cy: Number(sldSz?.getAttribute("cy")) || 6858000,
  }

  // Slide order: <p:sldIdLst><p:sldId r:id="rIdN"/></p:sldIdLst> → rels → paths.
  const presRels = parseRels(
    await readXml(zip, "ppt/_rels/presentation.xml.rels"),
    "ppt/presentation.xml"
  )
  const slidePaths: string[] = []
  const idList = presDoc.getElementsByTagName("p:sldId")
  for (const sldId of Array.from(idList)) {
    const rid = sldId.getAttribute("r:id")
    const path = rid ? presRels.get(rid) : undefined
    if (path) slidePaths.push(path)
  }
  if (slidePaths.length === 0)
    throw new Error("Presentation contains no slides")

  const slides: Slide[] = []
  const allImages: PendingImage[] = []

  for (const slidePath of slidePaths) {
    const ctx = await buildSlideContext(zip, slidePath, size)
    const { slide, images } = await parseSlide(zip, slidePath, ctx)
    slides.push(slide)
    allImages.push(...images)
  }

  // Resolve images (persist bytes → URL). Dedupe by zip path so an image reused
  // across slides is only written once.
  const urlCache = new Map<string, string>()
  for (const { apply, zipPath } of allImages) {
    try {
      let url = urlCache.get(zipPath)
      if (url === undefined) {
        const file = zip.file(zipPath)
        if (!file) continue
        const bytes = await file.async("uint8array")
        const name = zipPath.split("/").pop() ?? "image.png"
        const ext = name.split(".").pop()?.toLowerCase() ?? ""
        if (!IMAGE_EXTS.has(ext)) continue
        url = await resolveImage(bytes, name)
        urlCache.set(zipPath, url)
      }
      apply(url)
    } catch {
      // Leave imageUrl empty; the slide still imports.
    }
  }

  const baseName =
    fileName.replace(/\.pptx$/i, "").replace(/^.*[\\/]/, "") ||
    "Imported Presentation"
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: baseName,
    slides,
    createdAt: now,
    updatedAt: now,
  }
}

/** Assemble the theme / color-map / placeholder context for one slide. */
async function buildSlideContext(
  zip: JSZip,
  slidePath: string,
  size: SlideSize
): Promise<SlideContext> {
  const slideRelsPath = relsPathFor(slidePath)
  const slideRels = parseRels(await readXml(zip, slideRelsPath), slidePath)

  // slide → layout → master → theme, each linked via its own .rels.
  const layoutPath = findByType(slideRels, "slideLayout")
  const layoutRels = layoutPath
    ? parseRels(await readXml(zip, relsPathFor(layoutPath)), layoutPath)
    : new Map()
  const masterPath = layoutPath
    ? findByType(layoutRels, "slideMaster")
    : undefined
  const masterRels = masterPath
    ? parseRels(await readXml(zip, relsPathFor(masterPath)), masterPath)
    : new Map()
  const themePath = masterPath ? findByType(masterRels, "theme") : undefined

  const theme = parseThemeColors(
    themePath ? await readXml(zip, themePath) : null
  )
  const masterDoc = masterPath ? await readXml(zip, masterPath) : null
  const layoutDoc = layoutPath ? await readXml(zip, layoutPath) : null
  const clrMap = parseClrMap(masterDoc)
  const layoutPh = buildPlaceholderMap(layoutDoc)
  const masterPh = buildPlaceholderMap(masterDoc)

  return {
    size,
    theme,
    clrMap,
    layoutPh,
    masterPh,
    slideRels,
    layoutBg: bgResultFromDoc(layoutDoc, theme, clrMap, layoutRels),
    masterBg: bgResultFromDoc(masterDoc, theme, clrMap, masterRels),
    txStyles: parseTxStyles(masterDoc, theme, clrMap),
    defaultTextColor: resolveScheme("tx1", theme, clrMap),
  }
}

/** Path of the `.rels` part for a given part (e.g. slides/slide1.xml). */
function relsPathFor(partPath: string): string {
  const dir = partPath.includes("/")
    ? partPath.slice(0, partPath.lastIndexOf("/"))
    : ""
  const file = partPath.slice(partPath.lastIndexOf("/") + 1)
  return dir ? `${dir}/_rels/${file}.rels` : `_rels/${file}.rels`
}

/** Find the first relationship target whose type ends with `typeName`. */
function findByType(
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

/** Read the master's <p:clrMap> (bg1→lt1, tx1→dk1, …). */
function parseClrMap(masterDoc: Document | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!masterDoc) return map
  const clrMap = masterDoc.getElementsByTagName("p:clrMap").item(0)
  if (!clrMap) return map
  for (const attr of Array.from(clrMap.attributes)) {
    map.set(attr.name, attr.value)
  }
  return map
}
