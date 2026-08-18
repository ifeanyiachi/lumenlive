import JSZip from "jszip"
import type { Presentation, Slide } from "@/types/slide"
import { readXml } from "./xml"
import type { SlideSize } from "./geometry"
import { parseThemeColors, parseClrMap, resolveScheme } from "./colors"
import { parseRels, relsPathFor, findByType } from "./rels"
import { buildPlaceholderMap, parseTxStyles } from "./placeholders"
import { bgResultFromDoc } from "./background"
import { parseSlide, type SlideContext, type PendingImage } from "./slide"

// ── PowerPoint (.pptx) import ────────────────────────────────────────────────
//
// A .pptx is a ZIP of Open XML parts. We parse it entirely in the frontend
// (mirroring the existing JSON import path) and map each slide to the app's
// Slide model. Scope: text boxes, pictures, and slide backgrounds — no charts,
// tables, SmartArt, animations, or grouped-shape coordinate remapping.
//
// The parser is split by concern across this folder: `xml` (DOM helpers),
// `geometry` (EMU ↔ percent + point sizing), `colors` (theme/scheme/lumMod
// resolution), `rels` (.rels graph), `text`/`placeholders` (run + placeholder
// styling), `groups` (grouped-shape transforms), `background`, and `slide` (the
// per-shape walk). This module composes them into the public `parsePptx` entry.

/** Resolve extracted image bytes to a URL the Slide model can render. */
export type ImageResolver = (
  bytes: Uint8Array,
  fileName: string
) => Promise<string>

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
