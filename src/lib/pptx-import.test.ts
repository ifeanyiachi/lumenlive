// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { parsePptx } from "./pptx-import"
import type { SlideTextElement } from "@/types/slide"

// ── Minimal .pptx fixtures ───────────────────────────────────────────────────
//
// These build just enough of the Open XML part graph to exercise the parser's
// inheritance paths (slide → layout → master → theme), which is where real
// decks differ from the trivial "everything on the slide" shape.

const REL = (id: string, type: string, target: string) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`

const rels = (...r: string[]) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${r.join("")}</Relationships>`

const PRESENTATION = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`

const THEME = `<?xml version="1.0"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="1F4E79"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`

/** Layout with title/body placeholder geometry and (optionally) a background. */
const layoutXml = (bg = "") => `<?xml version="1.0"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>${bg}
    <p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="838200" y="365125"/><a:ext cx="10515600" cy="1325563"/></a:xfrm></p:spPr></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="838200" y="1825625"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr></p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`

/** Master with a background, color map, and title/body/other text styles. */
const masterXml = (bg: string) => `<?xml version="1.0"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>${bg}<p:spTree/></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>`

interface DeckParts {
  slide: string
  layoutBg?: string
  masterBg?: string
  /** Extra <Relationship> entries appended to the slide's .rels. */
  slideRels?: string[]
  /** Extra zip parts (e.g. embedded media), keyed by path. */
  files?: Record<string, string>
}

async function buildDeck(parts: DeckParts): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("ppt/presentation.xml", PRESENTATION)
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    rels(REL("rId1", "slide", "slides/slide1.xml"))
  )
  zip.file("ppt/slides/slide1.xml", parts.slide)
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    rels(
      REL("rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"),
      ...(parts.slideRels ?? [])
    )
  )
  for (const [path, content] of Object.entries(parts.files ?? {})) {
    zip.file(path, content)
  }
  zip.file("ppt/slideLayouts/slideLayout1.xml", layoutXml(parts.layoutBg))
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    rels(REL("rId1", "slideMaster", "../slideMasters/slideMaster1.xml"))
  )
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    masterXml(
      parts.masterBg ??
        `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg2"/></a:solidFill></p:bgPr></p:bg>`
    )
  )
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    rels(REL("rId1", "theme", "../theme/theme1.xml"))
  )
  zip.file("ppt/theme/theme1.xml", THEME)
  return zip.generateAsync({ type: "arraybuffer" })
}

/** A slide body with two placeholders and no bg / no per-run sz by default. */
const slideXml = (
  opts: { bg?: string; titleSz?: string } = {}
) => `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>${opts.bg ?? ""}
    <p:spTree>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r>${opts.titleSz ? `<a:rPr sz="${opts.titleSz}"/>` : ""}<a:t>Amazing Grace</a:t></a:r></a:p></p:txBody></p:sp>
      <p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:bodyPr/><a:p><a:r><a:t>How sweet the sound</a:t></a:r></a:p></p:txBody></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`

const parse = async (parts: DeckParts) =>
  (await parsePptx(await buildDeck(parts), "test.pptx", async () => ""))
    .slides[0]

/** Parse with an image resolver that echoes the file name, so URLs are testable. */
const parseWithImages = async (parts: DeckParts) =>
  (
    await parsePptx(
      await buildDeck(parts),
      "test.pptx",
      async (_bytes, name) => `resolved:${name}`
    )
  ).slides[0]

describe("pptx import — background inheritance", () => {
  it("inherits the slide master's background when the slide defines none", async () => {
    // clrMap bg2→lt2, theme lt2 = #1F4E79 — must NOT fall back to the default.
    const slide = await parse({ slide: slideXml() })
    expect(slide.background).toEqual({ type: "solid", color: "#1F4E79" })
  })

  it("prefers the layout background over the master background", async () => {
    const slide = await parse({
      slide: slideXml(),
      layoutBg: `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg>`,
    })
    expect(slide.background).toEqual({ type: "solid", color: "#112233" })
  })

  it("prefers the slide's own background over any inherited one", async () => {
    const slide = await parse({
      slide: slideXml({
        bg: `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill></p:bgPr></p:bg>`,
      }),
    })
    expect(slide.background).toEqual({ type: "solid", color: "#ABCDEF" })
  })

  it("falls back to the app default only when nothing defines a background", async () => {
    const slide = await parse({ slide: slideXml(), masterBg: "" })
    expect(slide.background).toEqual({ type: "solid", color: "#1a1a2e" })
  })
})

describe("pptx import — placeholder font-size inheritance", () => {
  it("inherits distinct title/body sizes from the master txStyles", async () => {
    const slide = await parse({ slide: slideXml() })
    const [title, body] = slide.elements as SlideTextElement[]
    // 44pt and 28pt on a 1080-tall design surface → 88px and 56px.
    expect(title.fontSize).toBeCloseTo(88, 5)
    expect(body.fontSize).toBeCloseTo(56, 5)
  })

  it("lets an explicit run size override the inherited default", async () => {
    const slide = await parse({ slide: slideXml({ titleSz: "3600" }) })
    const [title] = slide.elements as SlideTextElement[]
    // 36pt → 72px, not the 88px the titleStyle would have given.
    expect(title.fontSize).toBeCloseTo(72, 5)
  })
})

// The <p:sld> wrapper shared by the free-form tests below.
const sld = (spTree: string) => `<?xml version="1.0"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>${spTree}</p:spTree></p:cSld>
</p:sld>`

describe("pptx import — text colour inheritance", () => {
  it("defaults placeholder text to the theme's tx1 colour, not blind white", async () => {
    // clrMap tx1→dk1, theme dk1 = #000000. Previously every colourless run
    // rendered white — invisible on the light (#1F4E79/master) background.
    const slide = await parse({ slide: slideXml() })
    for (const el of slide.elements as SlideTextElement[]) {
      expect(el.color).toBe("#000000")
    }
  })

  it("lets an explicit run colour win over the tx1 default", async () => {
    const slide = await parse({
      slide: sld(
        `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/>
           <p:txBody><a:bodyPr/><a:p><a:r>
             <a:rPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr>
             <a:t>Red</a:t></a:r></a:p></p:txBody></p:sp>`
      ),
    })
    expect((slide.elements[0] as SlideTextElement).color).toBe("#FF0000")
  })
})

describe("pptx import — picture backgrounds", () => {
  it("resolves an embedded <a:blipFill> slide background to an image", async () => {
    const slide = await parseWithImages({
      slide: sld("").replace(
        "<p:spTree>",
        `<p:bg><p:bgPr><a:blipFill><a:blip r:embed="rIdImg"/></a:blipFill></p:bgPr></p:bg><p:spTree>`
      ),
      slideRels: [REL("rIdImg", "image", "../media/image1.png")],
      files: { "ppt/media/image1.png": "PNGBYTES" },
    })
    expect(slide.background).toEqual({
      type: "image",
      imageUrl: "resolved:image1.png",
    })
  })
})

describe("pptx import — grouped shapes", () => {
  it("flattens grouped-shape content with the child-coordinate transform", async () => {
    // Group placed over the full slide, child space scaled 2× → child coords
    // map at 0.5. A child at the child-space centre lands at the slide centre.
    const slide = await parse({
      slide: sld(
        `<p:grpSp>
           <p:nvGrpSpPr/>
           <p:grpSpPr><a:xfrm>
             <a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/>
             <a:chOff x="0" y="0"/><a:chExt cx="24384000" cy="13716000"/>
           </a:xfrm></p:grpSpPr>
           <p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr>
             <p:spPr><a:xfrm><a:off x="12192000" y="6858000"/><a:ext cx="2438400" cy="1371600"/></a:xfrm></p:spPr>
             <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="2400"/><a:t>Grouped</a:t></a:r></a:p></p:txBody></p:sp>
         </p:grpSp>`
      ),
    })
    // Content must not be dropped — the whole reason groups mattered.
    expect(slide.elements).toHaveLength(1)
    const el = slide.elements[0] as SlideTextElement
    expect(el.text).toBe("Grouped")
    expect(el.x).toBeCloseTo(50, 4)
    expect(el.y).toBeCloseTo(50, 4)
    expect(el.width).toBeCloseTo(10, 4)
    expect(el.height).toBeCloseTo(10, 4)
  })
})

describe("pptx import — rotation", () => {
  it("carries a shape's rotation across as clockwise degrees", async () => {
    const slide = await parse({
      slide: sld(
        `<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr>
           <p:spPr><a:xfrm rot="5400000"><a:off x="1000000" y="1000000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm></p:spPr>
           <p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="2400"/><a:t>Rotated</a:t></a:r></a:p></p:txBody></p:sp>`
      ),
    })
    // 5400000 / 60000 = 90°.
    expect((slide.elements[0] as SlideTextElement).rotation).toBe(90)
  })
})

describe("pptx import — explicit bullets", () => {
  const bulletSlide = (bullet: string) =>
    sld(
      `<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
         <p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6000000" cy="3000000"/></a:xfrm></p:spPr>
         <p:txBody><a:bodyPr/><a:p><a:pPr>${bullet}</a:pPr><a:r><a:t>Item</a:t></a:r></a:p></p:txBody></p:sp>`
    )

  it("maps an explicit <a:buChar> to a bullet list", async () => {
    const slide = await parse({ slide: bulletSlide(`<a:buChar char="•"/>`) })
    expect((slide.elements[0] as SlideTextElement).listType).toBe("bullet")
  })

  it("maps an explicit <a:buAutoNum> to a numbered list", async () => {
    const slide = await parse({
      slide: bulletSlide(`<a:buAutoNum type="arabicPeriod"/>`),
    })
    expect((slide.elements[0] as SlideTextElement).listType).toBe("numbered")
  })

  it("adds no list type when the paragraph declares no bullet", async () => {
    const slide = await parse({ slide: bulletSlide("") })
    expect((slide.elements[0] as SlideTextElement).listType).toBeUndefined()
  })
})
