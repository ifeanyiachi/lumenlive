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
 * Announcement theme controls (themeredo.md, Phase 3). Leads with the two
 * authored placeholders — a `role:"title"` and a `role:"body"` text element.
 */
export function AnnouncementThemeProperties({
  elements,
}: {
  elements: SlideElement[]
}) {
  const title = findTextRole(elements, "title")
  const body = findTextRole(elements, "body")

  return (
    <ThemePanelShell
      title="Announcement Theme"
      icon={<MegaphoneIcon className="size-3.5" />}
    >
      {title ? (
        <TextRoleSection label="Title" element={title} maxSize={160} />
      ) : (
        <MissingPlaceholder what='a title placeholder' />
      )}
      {body ? (
        <TextRoleSection label="Body" element={body} maxSize={120} />
      ) : (
        <MissingPlaceholder what='a body placeholder' />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
