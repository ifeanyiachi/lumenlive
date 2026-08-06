import { jsPDF } from "jspdf"
import type { Presentation, Slide } from "@/types/slide"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, preloadSlideImage } from "@/lib/slide-image-cache"
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "@/lib/canvas-constants"

const SLIDE_W = DESIGN_WIDTH
const SLIDE_H = DESIGN_HEIGHT

async function preloadImagesForSlides(slides: Slide[]): Promise<void> {
  const urls = new Set<string>()
  for (const slide of slides) {
    if (slide.background.type === "image" && slide.background.imageUrl) {
      urls.add(slide.background.imageUrl)
    }
    for (const el of slide.elements) {
      if (el.type === "image" && el.imageUrl) urls.add(el.imageUrl)
    }
  }
  await Promise.all(
    [...urls].map((url) => preloadSlideImage(url).catch(() => {}))
  )
}

function renderSlidesToPdf(slides: Slide[], filename: string): void {
  const canvas = document.createElement("canvas")
  canvas.width = SLIDE_W
  canvas.height = SLIDE_H
  const ctx = canvas.getContext("2d")!
  const imageCache = getSlideImageCache()

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [SLIDE_W, SLIDE_H],
  })

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], "landscape")

    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H)
    renderSlide(ctx, slides[i], SLIDE_W, SLIDE_H, imageCache)

    const imgData = canvas.toDataURL("image/jpeg", 0.92)
    pdf.addImage(imgData, "JPEG", 0, 0, SLIDE_W, SLIDE_H)
  }

  pdf.save(filename)
}

export async function exportAllSlidesAsPdf(
  presentation: Presentation
): Promise<void> {
  await preloadImagesForSlides(presentation.slides)
  renderSlidesToPdf(
    presentation.slides,
    `${presentation.name || "presentation"}.pdf`
  )
}

export async function exportCurrentSlideAsPdf(
  presentation: Presentation,
  slideIndex: number
): Promise<void> {
  const slide = presentation.slides[slideIndex]
  if (!slide) return
  await preloadImagesForSlides([slide])
  renderSlidesToPdf(
    [slide],
    `${presentation.name || "presentation"} - Slide ${slideIndex + 1}.pdf`
  )
}
