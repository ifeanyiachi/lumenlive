import { MusicIcon } from "lucide-react"
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
  const lyrics = findTextRole(elements, "lyrics")

  return (
    <ThemePanelShell
      title="Song Theme"
      icon={<MusicIcon className="size-3.5" />}
    >
      {lyrics ? (
        <Section label="Lyrics">
          <SizeRow
            label="Size"
            value={lyrics.fontSize}
            onChange={(v) => patchElement(lyrics.id, { fontSize: v })}
            max={160}
          />
          <WeightRow
            value={lyrics.fontWeight}
            onChange={(v) => patchElement(lyrics.id, { fontWeight: v })}
          />
          <ColorRow
            label="Color"
            value={lyrics.color}
            onChange={(v) => patchElement(lyrics.id, { color: v })}
          />
          <AlignRow
            value={lyrics.horizontalAlign}
            onChange={(v) => patchElement(lyrics.id, { horizontalAlign: v })}
          />
        </Section>
      ) : (
        <MissingPlaceholder what='a lyrics placeholder' />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
