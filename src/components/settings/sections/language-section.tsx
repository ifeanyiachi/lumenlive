import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

export function LanguageSection() {
  const { t } = useTranslation("settings")
  const uiLanguage = useSettingsStore((s) => s.uiLanguage)
  const setUiLanguage = useSettingsStore((s) => s.setUiLanguage)

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("language.label")}
      </label>
      <Select
        value={uiLanguage}
        onValueChange={(value) => setUiLanguage(value as SupportedLocale)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((locale) => (
            <SelectItem key={locale.code} value={locale.code}>
              {locale.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[0.625rem] text-muted-foreground">
        {t("language.description")}
      </p>
    </div>
  )
}
