import type JSZip from "jszip"
import type {
  Slide,
  SlideElement,
  SlideImageElement,
  SlideTextElement,
} from "@/types/slide"
import { createDefaultSlide } from "@/lib/slide-defaults"
import { readXml, firstChild, firstDesc } from "./xml"
import {
  readXfrm,
  rectFromXfrm,
  readRot,
  ptToPx,
  type SlideSize,
} from "./geometry"
import { resolveColor, type ThemeColors } from "./colors"
import {
  resolvePlaceholderXfrm,
  txStyleFor,
  type PlaceholderMap,
  type TxStyleMap,
} from "./placeholders"
import {
  IDENTITY_TF,
  applyTransform,
  composeGroupTransform,
  type GroupTransform,
} from "./groups"
import { resolveBg, materializeBg, type BgResult } from "./background"
import { extractText } from "./text"

// ── Slide parsing ────────────────────────────────────────────────────────────

export interface SlideContext {
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
export interface PendingImage {
  zipPath: string
  apply: (url: string) => void
}

export async function parseSlide(
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
