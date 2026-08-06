import JSZip from "jszip"
import type {
  Presentation,
  Slide,
  SlideBackground,
  SlideImageElement,
  SlideTextElement,
} from "@/types/slide"
import { createDefaultSlide } from "@/types/slide"

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
  bold: boolean
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
}

/**
 * Pull the plaintext plus a representative run style from a `<p:txBody>`.
 * Paragraphs join with newlines; the style is taken from the first styled run
 * (good enough for the mid-fidelity target — the model has one style per box).
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
  let style: RunStyle | null = null

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
      if (!style) style = readRunStyle(run, theme, clrMap)
    }
    // A break-only paragraph (<a:br/>) or an empty paragraph still adds a line.
    lines.push(lineText)
  }

  const text = lines.join("\n").replace(/\n+$/, "")
  if (!text.trim()) return null

  return {
    text,
    align,
    style: style ?? emptyStyle(),
  }
}

function emptyStyle(): RunStyle {
  return {
    bold: false,
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
  return {
    bold: rPr.getAttribute("b") === "1",
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

// ── Slide parsing ────────────────────────────────────────────────────────────

interface SlideContext {
  size: SlideSize
  theme: ThemeColors
  clrMap: Map<string, string>
  layoutPh: PlaceholderMap
  masterPh: PlaceholderMap
  slideRels: Map<string, string>
}

interface PendingImage {
  element: SlideImageElement
  zipPath: string
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
  slide.background = parseBackground(cSld, ctx)

  const tree = xml?.getElementsByTagName("p:spTree").item(0)
  if (tree) {
    for (const node of Array.from(tree.children)) {
      if (node.tagName === "p:sp") {
        const el = parseShape(node, ctx)
        if (el) slide.elements.push(el)
      } else if (node.tagName === "p:pic") {
        const pending = parsePicture(node, ctx)
        if (pending) {
          slide.elements.push(pending.element)
          images.push(pending)
        }
      }
    }
  }

  return { slide, images }
}

function parseShape(sp: Element, ctx: SlideContext): SlideTextElement | null {
  const txBody = firstDesc(sp, "p:txBody")
  if (!txBody) return null
  const extracted = extractText(txBody, ctx.theme, ctx.clrMap)
  if (!extracted) return null

  const spPr = firstChild(sp, "p:spPr")
  let xfrm = readXfrm(spPr)
  if (!xfrm) {
    const ph = firstDesc(sp, "p:ph")
    if (ph) xfrm = resolvePlaceholderXfrm(ph, ctx.layoutPh, ctx.masterPh)
  }
  // Fall back to a centered box when geometry can't be resolved at all.
  const geom = xfrm
    ? rectFromXfrm(xfrm, ctx.size)
    : { x: 5, y: 5, width: 90, height: 90 }

  const { style } = extracted
  const fontSize =
    style.sizePt !== null ? ptToPx(style.sizePt, ctx.size.cy) : 40

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

  return {
    id: crypto.randomUUID(),
    type: "text",
    text: extracted.text,
    ...geom,
    fontFamily: style.font ?? "Inter",
    fontSize,
    fontWeight: style.bold ? 700 : 400,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    color: style.color ?? "#ffffff",
    horizontalAlign: extracted.align,
    verticalAlign,
    lineHeight: 1.2,
    textTransform: "none",
    ...(shapeFill ? { backgroundColor: shapeFill } : {}),
  }
}

function parsePicture(pic: Element, ctx: SlideContext): PendingImage | null {
  const blip = firstDesc(pic, "a:blip")
  const embed = blip?.getAttribute("r:embed")
  if (!embed) return null
  const zipPath = ctx.slideRels.get(embed)
  if (!zipPath) return null

  const spPr = firstDesc(pic, "p:spPr")
  const xfrm = readXfrm(spPr)
  const geom = xfrm
    ? rectFromXfrm(xfrm, ctx.size)
    : { x: 20, y: 20, width: 60, height: 60 }

  const element: SlideImageElement = {
    id: crypto.randomUUID(),
    type: "image",
    imageUrl: "",
    ...geom,
    objectFit: "contain",
    opacity: 1,
    borderRadius: 0,
  }
  return { element, zipPath }
}

function rectFromXfrm(xfrm: Xfrm, size: SlideSize) {
  return {
    x: emuToPct(xfrm.x, size.cx),
    y: emuToPct(xfrm.y, size.cy),
    width: emuToPct(xfrm.cx, size.cx),
    height: emuToPct(xfrm.cy, size.cy),
  }
}

function parseBackground(
  cSld: Element | null,
  ctx: SlideContext
): SlideBackground {
  const bg = cSld ? firstChild(cSld, "p:bg") : null
  if (bg) {
    const bgPr = firstDesc(bg, "p:bgPr")
    if (bgPr) {
      const solid = firstChild(bgPr, "a:solidFill")
      const color = resolveColor(solid, ctx.theme, ctx.clrMap)
      if (color) return { type: "solid", color }

      const grad = parseGradient(firstChild(bgPr, "a:gradFill"), ctx)
      if (grad) return grad
    }
    // <p:bgRef> pointing at a theme fill: resolve just its color override.
    const bgRef = firstChild(bg, "p:bgRef")
    if (bgRef) {
      const color = resolveColor(bgRef, ctx.theme, ctx.clrMap)
      if (color) return { type: "solid", color }
    }
  }
  return { type: "solid", color: "#1a1a2e" }
}

function parseGradient(
  gradFill: Element | null,
  ctx: SlideContext
): SlideBackground | null {
  if (!gradFill) return null
  const gsList = firstChild(gradFill, "a:gsLst")
  if (!gsList) return null
  const stops: { offset: number; color: string }[] = []
  for (const gs of childrenByTag(gsList, "a:gs")) {
    const pos = Number(gs.getAttribute("pos"))
    const color = resolveColor(gs, ctx.theme, ctx.clrMap)
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
  for (const { element, zipPath } of allImages) {
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
      element.imageUrl = url
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
  const clrMap = parseClrMap(masterDoc)
  const layoutPh = buildPlaceholderMap(
    layoutPath ? await readXml(zip, layoutPath) : null
  )
  const masterPh = buildPlaceholderMap(masterDoc)

  return { size, theme, clrMap, layoutPh, masterPh, slideRels }
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
