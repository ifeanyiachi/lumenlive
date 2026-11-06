import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/stores"
import { useTranslation } from "react-i18next"

export function LanguageSection() {
  const { t } = useTranslation("settings")
  const uiLanguage = useSettingsStore((s) => s.uiLanguage)
  const setUiLanguage = useSettingsStore((s) => s.setUiLanguage)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {t("language.label")}
        </h2>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
          {t("language.description")}
        </p>
      </div>

      <RadioGroup
        value={uiLanguage}
        onValueChange={(value) => setUiLanguage(value as SupportedLocale)}
        aria-label={t("language.label")}
        className="gap-2"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <label
            key={locale.code}
            htmlFor={`interface-language-${locale.code}`}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/60",
              uiLanguage === locale.code && "border-primary bg-primary/5"
            )}
          >
            <RadioGroupItem
              id={`interface-language-${locale.code}`}
              value={locale.code}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {locale.displayName}
              </span>
              <span className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
                {locale.code}
              </span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}
