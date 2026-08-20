import { MegaphoneIcon } from "lucide-react"
import type { SlideElement, SlideTextElement } from "@/types/slide"
import { findTextRole } from "@/lib/theme/model/roles"
import {
  ThemePanelShell,
  Section,
  ColorRow,
  SizeRow,
  WeightRow,
  MissingPlaceholder,
  SelectElementHint,
} from "./_shared"
import { patchElement } from "./helpers"

function TextRoleSection({
  label,
  element,
  maxSize,
}: {
  label: string
  element: SlideTextElement
  maxSize: number
}) {
  return (
    <Section label={label}>
      <SizeRow
        label="Size"
        value={element.fontSize}
        onChange={(v) => patchElement(element.id, { fontSize: v })}
        max={maxSize}
      />
      <WeightRow
        value={element.fontWeight}
        onChange={(v) => patchElement(element.id, { fontWeight: v })}
      />
      <ColorRow
        label="Color"
        value={element.color}
        onChange={(v) => patchElement(element.id, { color: v })}
      />
    </Section>
  )
}

/**
 * Sermon theme controls (themeredo.md, Phase 3). Leads with the two authored
 * placeholders — a `role:"title"` and a `role:"points"` text element.
 */
export function SermonThemeProperties({
  elements,
}: {
  elements: SlideElement[]
}) {
  const title = findTextRole(elements, "title")
  const points = findTextRole(elements, "points")

  return (
    <ThemePanelShell
      title="Sermon Theme"
      icon={<MegaphoneIcon className="size-3.5" />}
    >
      {title ? (
        <TextRoleSection label="Title" element={title} maxSize={160} />
      ) : (
        <MissingPlaceholder what='a title placeholder' />
      )}
      {points ? (
        <TextRoleSection label="Points" element={points} maxSize={120} />
      ) : (
        <MissingPlaceholder what='a points placeholder' />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
