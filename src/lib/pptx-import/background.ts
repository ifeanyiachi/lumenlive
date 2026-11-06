import type { SlideBackground } from "@/types/slide"
import { childrenByTag, firstChild, firstDesc } from "./xml"
import { resolveColor, type ThemeColors } from "./colors"
import type { PendingImage } from "./slide"

// ── Background resolution ─────────────────────────────────────────────────────

/** A background either resolved to a fill, or pending an embedded image. */
export type BgResult =
  | { kind: "fill"; bg: SlideBackground }
  | { kind: "image"; zipPath: string }
  | null

/** Turn a resolved/pending background into a concrete {@link SlideBackground}. */
export function materializeBg(
  result: BgResult,
  images: PendingImage[]
): SlideBackground {
  if (!result) return { type: "solid", color: "#1a1a2e" }
  if (result.kind === "fill") return result.bg
  const bg: SlideBackground = { type: "image", imageUrl: "" }
  images.push({ zipPath: result.zipPath, apply: (url) => (bg.imageUrl = url) })
  return bg
}

/**
 * Resolve a background from a part's `<p:cSld>`: a solid/gradient/bgRef fill,
 * or an embedded picture (`<a:blipFill>`) surfaced as a pending image via the
 * part's own `rels`. Returns null when the part defines none, so the caller can
 * fall through the slide → layout → master → default inheritance chain. Takes
 * theme/color-map/rels directly rather than a full {@link SlideContext} so it
 * can also resolve layout/master backgrounds while the context is assembling.
 */
export function resolveBg(
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
export function bgResultFromDoc(
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
