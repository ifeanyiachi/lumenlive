import { useState, useEffect } from "react"

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

export function BibleSection() {
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
          Primary Translation
        </label>
        <Select
          value={String(activeId)}
          onValueChange={handleChange}
          disabled={loading}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={loading ? "Loading..." : "Select translation"}
            />
          </SelectTrigger>
          <SelectContent>
            {englishTranslations.length > 0 && (
              <>
                <div className="px-2 py-1 text-[0.5625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  English
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
                  Other Languages
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
          Detected verses will display in this translation.
          {translations.length > 0 &&
            ` ${translations.length} translations available.`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Original Languages
        </label>
        <ToggleCard
          title="Greek & Hebrew lexicon"
          description={
            <>
              Bundled with KJV but off by default. When on, each verse gains an
              interlinear (He / Gr) toggle for word-by-word original text with
              Strong&apos;s definitions, and lets you push a word study to the
              program preview. When off, it stays hidden everywhere.
            </>
          }
          checked={lexiconEnabled}
          onCheckedChange={setLexiconEnabled}
        />
      </div>
    </div>
  )
}
