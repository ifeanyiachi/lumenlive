import { LayersIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { usePresentationStore } from "@/stores/presentation-store"
import type { SlideBackground } from "@/types/slide"
import { ThemePanelShell, Section, SelectElementHint } from "./_shared"

/**
 * Overlay / Lower-third theme controls (themeredo.md, Phase 3). An overlay
 * composites over live output, so its one hard requirement is a transparent
 * background — this panel leads with that invariant and offers a one-click fix
 * when it drifts.
 */
export function OverlayThemeProperties({
  background,
}: {
  background: SlideBackground
}) {
  const { t } = useTranslation("slides")
  const isTransparent = background.type === "transparent"

  return (
    <ThemePanelShell
      title={t("themeProperties.overlayTheme")}
      icon={<LayersIcon className="size-3.5" />}
    >
      <Section label={t("themeProperties.compositing")}>
        {isTransparent ? (
          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            {t("themeProperties.overlayTransparent")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[0.6875rem] text-amber-600 dark:text-amber-400">
              {t("themeProperties.overlayOpaque")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                usePresentationStore
                  .getState()
                  .updateDraftSlide({ background: { type: "transparent" } })
              }
            >
              {t("themeProperties.makeTransparent")}
            </Button>
          </div>
        )}
      </Section>
      <SelectElementHint />
    </ThemePanelShell>
  )
}
