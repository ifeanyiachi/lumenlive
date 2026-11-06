import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore, useBibleStore } from "@/stores"
import {
  listTranslations,
  getActiveTranslation,
  setActiveTranslation,
} from "@/services/translation-gateway"
import {
  groupTranslations,
  type TranslationInfo,
} from "@/lib/settings/translations"

import { ToggleCard } from "../ui/toggle-card"
import { BibleTranslationsSection } from "./bible-translations-section"

export function BibleSection() {
  const { t } = useTranslation("settings")
  const [translations, setTranslations] = useState<TranslationInfo[]>([])
  const [activeId, setActiveId] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const lexiconEnabled = useSettingsStore((s) => s.lexiconEnabled)
  const setLexiconEnabled = useSettingsStore((s) => s.setLexiconEnabled)

  useEffect(() => {
    async function load() {
      try {
        const [trans, active] = await Promise.all([
          listTranslations(),
          getActiveTranslation(),
        ])
        setTranslations(trans)
        setActiveId(active)
      } catch (e) {
        console.error("Failed to load translations:", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleChange = async (value: string) => {
    const id = parseInt(value)
    try {
      await setActiveTranslation(id)
      setActiveId(id)
      // Update the frontend store so all panels use the new translation.
      useBibleStore.getState().setActiveTranslation(id)
    } catch (e) {
      console.error("Failed to set translation:", e)
    }
  }

  const { english: englishTranslations, other: otherTranslations } =
    groupTranslations(translations)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("bible.primaryTranslation")}
        </label>
        <Select
          value={String(activeId)}
          onValueChange={handleChange}
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                loading ? t("bible.loading") : t("bible.selectTranslation")
              }
            />
          </SelectTrigger>
          <SelectContent>
            {englishTranslations.length > 0 && (
              <>
                <div className="px-2 py-1 text-[0.5625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {t("bible.english")}
                </div>
                {englishTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.abbreviation} — {t.title}
                  </SelectItem>
                ))}
              </>
            )}
            {otherTranslations.length > 0 && (
              <>
                <div className="mt-1 px-2 py-1 text-[0.5625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {t("bible.otherLanguages")}
                </div>
                {otherTranslations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.abbreviation} — {t.title}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <p className="text-[0.625rem] text-muted-foreground">
          {t("bible.detectedVerses")}
          {translations.length > 0 &&
            ` ${t("bible.translationsAvailable", { count: translations.length })}`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("bible.originalLanguages")}
        </label>
        <ToggleCard
          title={t("bible.lexicon.title")}
          description={t("bible.lexicon.description")}
          checked={lexiconEnabled}
          onCheckedChange={setLexiconEnabled}
        />
      </div>

      <BibleTranslationsSection />
    </div>
  )
}
