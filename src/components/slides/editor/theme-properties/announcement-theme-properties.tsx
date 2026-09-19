import { MegaphoneIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation("slides")
  return (
    <Section label={label}>
      <SizeRow
        label={t("timerProperties.size")}
        value={element.fontSize}
        onChange={(v) => patchElement(element.id, { fontSize: v })}
        max={maxSize}
      />
      <WeightRow
        value={element.fontWeight}
        onChange={(v) => patchElement(element.id, { fontWeight: v })}
      />
      <ColorRow
        label={t("properties.color")}
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
  const { t } = useTranslation("slides")
  const title = findTextRole(elements, "title")
  const body = findTextRole(elements, "body")

  return (
    <ThemePanelShell
      title={t("themeProperties.announcementTheme")}
      icon={<MegaphoneIcon className="size-3.5" />}
    >
      {title ? (
        <TextRoleSection
          label={t("themeProperties.title")}
          element={title}
          maxSize={160}
        />
      ) : (
        <MissingPlaceholder what={t("themeProperties.titlePlaceholder")} />
      )}
      {body ? (
        <TextRoleSection
          label={t("themeProperties.body")}
          element={body}
          maxSize={120}
        />
      ) : (
        <MissingPlaceholder what={t("themeProperties.bodyPlaceholder")} />
      )}
      <SelectElementHint />
    </ThemePanelShell>
  )
}
