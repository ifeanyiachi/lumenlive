import { describe, it, expect, beforeEach, vi } from "vitest"
import type { LexiconCardData } from "@/types/lexicon"

// The renderer draws on a 2D canvas that jsdom/node lacks. Stub
// document.createElement("canvas") with a recording context so we can assert on
// the exact draw operations (and prove the plain path is unchanged when a field
// carries no spans).

interface Op {
  op: string
  args: unknown[]
  font: string
  fillStyle: string
  strokeStyle: string
}

let ops: Op[]

function makeRecordingContext() {
  const ctx = {
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    textAlign: "",
    textBaseline: "",
    // Deterministic width so wrapping is stable across runs.
    measureText: (t: string) => ({ width: t.length * 10 }),
    scale: (...a: unknown[]) => record("scale", a),
    fillRect: (...a: unknown[]) => record("fillRect", a),
    fillText: (...a: unknown[]) => record("fillText", a),
    beginPath: (...a: unknown[]) => record("beginPath", a),
    moveTo: (...a: unknown[]) => record("moveTo", a),
    lineTo: (...a: unknown[]) => record("lineTo", a),
    stroke: (...a: unknown[]) => record("stroke", a),
  }
  function record(op: string, args: unknown[]) {
    ops.push({
      op,
      args,
      font: ctx.font,
      fillStyle: ctx.fillStyle,
      strokeStyle: ctx.strokeStyle,
    })
  }
  return ctx
}

beforeEach(() => {
  ops = []
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => makeRecordingContext(),
      toDataURL: () => "data:image/png;base64,STUB",
    }),
  })
})

// Imported after the stub so the module picks up the patched globals lazily
// (renderLexiconCardToDataUrl reads document at call time, so import order is
// not actually load-bearing, but this keeps intent clear).
import {
  renderLexiconCardToDataUrl,
  renderLexiconCardToCanvas,
} from "./lexicon-card-renderer"

const base: LexiconCardData = {
  reference: "John 3:16",
  strong: "G26",
  summary: "agape: love, good will",
  lemma: "ἀγάπη",
  partOfSpeech: "Noun Feminine",
  transliteration: "agapē",
  pronunciation: "ag-ah'-pay",
  kjvUsage: "love, charity, dear",
  wordOrigin: "from agapao",
  definition: "affection, good will, love, benevolence",
  isHebrew: false,
}

/** The text of every fillText call, in order. */
const drawnTexts = () =>
  ops.filter((o) => o.op === "fillText").map((o) => String(o.args[0]))

describe("renderLexiconCardToDataUrl — parity", () => {
  it("no styles vs. empty span arrays produce identical draw ops", () => {
    renderLexiconCardToDataUrl(base)
    const plain = JSON.stringify(ops)

    ops = []
    renderLexiconCardToDataUrl({
      ...base,
      // Empty span arrays for every field must fall through to the plain path.
      styles: { definition: [], summary: [], kjvUsage: [] },
    })
    const emptySpans = JSON.stringify(ops)

    expect(emptySpans).toBe(plain)
  })

  it("the plain path never strokes (underline is the only stroke source)", () => {
    renderLexiconCardToDataUrl(base)
    expect(ops.some((o) => o.op === "stroke")).toBe(false)
  })

  it("draws each field's full text on the plain path", () => {
    renderLexiconCardToDataUrl(base)
    const all = drawnTexts().join(" ")
    expect(all).toContain("agape: love, good will")
    expect(all).toContain("ἀγάπη")
    expect(all).toContain("affection,")
  })
})

describe("renderLexiconCardToDataUrl — styled", () => {
  it("underline emits a stroke", () => {
    renderLexiconCardToDataUrl({
      ...base,
      styles: {
        definition: [{ start: 0, end: 9, style: { underline: true } }],
      },
    })
    expect(ops.some((o) => o.op === "stroke")).toBe(true)
  })

  it("bold sets a 700-weight font on the value text", () => {
    renderLexiconCardToDataUrl({
      ...base,
      styles: { definition: [{ start: 0, end: 9, style: { bold: true } }] },
    })
    // "affection" is the first definition word; drawn bold ⇒ weight 700. (The
    // span stops before the comma, so the bold run is "affection" without it.)
    const boldRun = ops.find(
      (o) =>
        o.op === "fillText" &&
        o.args[0] === "affection" &&
        /(^|\s)700\s/.test(o.font)
    )
    expect(boldRun).toBeDefined()
  })

  it("color overrides the value fillStyle for the styled run", () => {
    renderLexiconCardToDataUrl({
      ...base,
      styles: {
        definition: [{ start: 0, end: 9, style: { color: "#ef4444" } }],
      },
    })
    const colored = ops.find(
      (o) => o.op === "fillText" && o.fillStyle === "#ef4444"
    )
    expect(colored).toBeDefined()
  })

  it("highlight paints a background rect in the highlight color", () => {
    renderLexiconCardToDataUrl({
      ...base,
      styles: {
        definition: [{ start: 0, end: 9, style: { highlight: "#facc15" } }],
      },
    })
    const rect = ops.find(
      (o) => o.op === "fillRect" && o.fillStyle === "#facc15"
    )
    expect(rect).toBeDefined()
  })

  it("styling one field leaves the others on the plain path", () => {
    renderLexiconCardToDataUrl({
      ...base,
      styles: { summary: [{ start: 0, end: 5, style: { bold: true } }] },
    })
    // The full summary text is still drawn (across runs), and the definition
    // remains a single plain draw.
    const all = drawnTexts().join(" ")
    expect(all).toContain("affection, good will, love, benevolence")
  })
})

describe("preview scaling", () => {
  it("scale 1 draws at design size and never scales the context", () => {
    const canvas = { width: 0, height: 0, getContext: () => null }
    // renderLexiconCardToDataUrl uses its own canvas via createElement; check ops.
    renderLexiconCardToDataUrl(base) // default scale 1
    expect(ops.some((o) => o.op === "scale")).toBe(false)
    void canvas
  })

  it("scale < 1 scales the context (smaller backing store, same layout)", () => {
    renderLexiconCardToDataUrl(base, 0.5)
    const scaleOp = ops.find((o) => o.op === "scale")
    expect(scaleOp?.args).toEqual([0.5, 0.5])
    // Text is still drawn (layout math unchanged), just onto a smaller bitmap.
    expect(drawnTexts().join(" ")).toContain("affection,")
  })

  it("renderLexiconCardToCanvas draws onto the given canvas without toDataURL", () => {
    let toDataUrlCalled = false
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => makeRecordingContext(),
      toDataURL: () => {
        toDataUrlCalled = true
        return ""
      },
    } as unknown as HTMLCanvasElement
    renderLexiconCardToCanvas(canvas, base, 0.5)
    expect(canvas.width).toBe(Math.round(1920 * 0.5))
    expect(toDataUrlCalled).toBe(false)
    expect(drawnTexts().join(" ")).toContain("agape: love, good will")
  })
})
