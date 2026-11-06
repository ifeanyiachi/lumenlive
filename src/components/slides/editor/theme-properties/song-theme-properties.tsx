import { MusicIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { SlideElement } from "@/types/slide"
import { findTextRole } from "@/lib/theme/model/roles"
import {
  ThemePanelShell,
  Section,
  ColorRow,
  SizeRow,
  WeightRow,
  AlignRow,
  MissingPlaceholder,
  SelectElementHint,
} from "./_shared"
import { patchElement } from "./helpers"

/**
 * Song/Lyrics theme controls (themeredo.md, Phase 3). Leads with the
 * `role:"lyrics"` placeholder's typography, filled with the current lyric lines
 * at go-live.
 */
export function SongThemeProperties({
  elements,
}: {
  elements: SlideElement[]
}) {
  const { t } = useTranslation("slides")
  const lyrics = findTextRole(elements, "lyrics")

  return (
    <ThemePanelShell
      title={t("themeProperties.songTheme")}
      icon={<MusicIcon className="size-3.5" />}
    >
      {lyrics ? (
        <Section label={t("themeProperties.lyrics")}>
          <SizeRow
            label={t("timerProperties.size")}
            value={lyrics.fontSize}
            onChange={(v) => patchElement(lyrics.id, { fontSize: v })}
            max={160}
          />
          <WeightRow
            value={lyrics.fontWeight}
            onChange={(v) => patchElement(lyrics.id, { fontWeight: v })}
          />
          <ColorRow
            label={t("properties.color")}
            value={lyrics.color}
            onChange={(v) => patchElement(lyrics.id, { color: v })}
          />
          <AlignRow
            value={lyrics.horizontalAlign}
            onChange={(v) => patchElement(lyrics.id, { horizontalAlign: v })}
          />
        </Section>
      ) : (
        <MissingPlaceholder what={t("themeProperties.lyricsPlaceholder")} />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
