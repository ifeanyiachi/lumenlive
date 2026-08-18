import type { SlideTextElement } from "@/types/slide"
import { childrenByTag, firstChild } from "./xml"
import { resolveColor, type ThemeColors } from "./colors"

// ── Text extraction ──────────────────────────────────────────────────────────

export interface RunStyle {
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

export interface ExtractedText {
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
export function extractText(
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
