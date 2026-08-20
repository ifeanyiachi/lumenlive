import { BookOpenIcon } from "lucide-react"
import type { SlideElement } from "@/types/slide"
import { findScriptureElement } from "@/lib/theme/model/roles"
import {
  ThemePanelShell,
  Section,
  ColorRow,
  SizeRow,
  AlignRow,
  MissingPlaceholder,
  SelectElementHint,
} from "./_shared"
import { patchElement } from "./helpers"

/**
 * Scripture theme controls (themeredo.md, Phase 3). Leads with the scripture
 * placeholder's typography — the verse and its reference — which the pushed
 * reference + verse text fill at go-live.
 */
export function ScriptureThemeProperties({
  elements,
}: {
  elements: SlideElement[]
}) {
  const scripture = findScriptureElement(elements)

  return (
    <ThemePanelShell
      title="Scripture Theme"
      icon={<BookOpenIcon className="size-3.5" />}
    >
      {scripture ? (
        <>
          <Section label="Verse">
            <SizeRow
              label="Size"
              value={scripture.fontSize}
              onChange={(v) => patchElement(scripture.id, { fontSize: v })}
              max={160}
            />
            <ColorRow
              label="Color"
              value={scripture.color}
              onChange={(v) => patchElement(scripture.id, { color: v })}
            />
            <AlignRow
              value={scripture.horizontalAlign}
              onChange={(v) =>
                patchElement(scripture.id, { horizontalAlign: v })
              }
            />
          </Section>
          <Section label="Reference">
            <SizeRow
              label="Size"
              value={scripture.referenceFontSize}
              onChange={(v) =>
                patchElement(scripture.id, { referenceFontSize: v })
              }
              min={8}
              max={96}
            />
            <ColorRow
              label="Color"
              value={scripture.referenceColor}
              onChange={(v) =>
                patchElement(scripture.id, { referenceColor: v })
              }
            />
          </Section>
        </>
      ) : (
        <MissingPlaceholder what="a scripture placeholder" />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
