import type {
  Presentation,
  SlideElement,
  SlideTextElement,
} from "@/types/slide"

/**
 * Migrate legacy elements that lack the `type` discriminator.
 * Called once during hydration so the rest of the app can rely on typed elements.
 */
export function migrateSlideElements(
  presentations: Presentation[]
): Presentation[] {
  let changed = false
  const migrated = presentations.map((p) => ({
    ...p,
    slides: p.slides.map((s) => ({
      ...s,
      elements: s.elements.map((el): SlideElement => {
        if ("type" in el && el.type) return el
        changed = true
        const legacy = el as Record<string, unknown>
        return {
          type: "text",
          id: legacy.id as string,
          text: (legacy.text as string) ?? "",
          x: (legacy.x as number) ?? 0,
          y: (legacy.y as number) ?? 0,
          width: (legacy.width as number) ?? 80,
          height: (legacy.height as number) ?? 40,
          fontFamily: (legacy.fontFamily as string) ?? "Inter",
          fontSize: (legacy.fontSize as number) ?? 48,
          fontWeight: (legacy.fontWeight as number) ?? 600,
          bold: false,
          italic: false,
          underline: false,
          color: (legacy.color as string) ?? "#ffffff",
          horizontalAlign:
            (legacy.horizontalAlign as SlideTextElement["horizontalAlign"]) ??
            "center",
          verticalAlign:
            (legacy.verticalAlign as SlideTextElement["verticalAlign"]) ??
            "middle",
          lineHeight: (legacy.lineHeight as number) ?? 1.4,
          textTransform:
            (legacy.textTransform as SlideTextElement["textTransform"]) ??
            "none",
          backgroundColor: legacy.backgroundColor as string | undefined,
          shadow: legacy.shadow as SlideTextElement["shadow"],
          outline: legacy.outline as SlideTextElement["outline"],
        }
      }),
    })),
  }))
  return changed ? migrated : presentations
}
