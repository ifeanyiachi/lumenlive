import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config"
import { Button } from "@/components/ui/button"
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

      <div className="overflow-hidden rounded-lg border border-border">
        {SUPPORTED_LOCALES.map((locale) => {
          const active = uiLanguage === locale.code

          return (
            <div
              key={locale.code}
              className="group flex items-center justify-between gap-4 border-b border-border px-3 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {locale.displayName}
                </div>
                <div className="mt-0.5 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
                  {locale.code}
                </div>
              </div>
              <Button
                size="sm"
                variant={active ? "secondary" : "outline"}
                disabled={active}
                className={
                  active
                    ? undefined
                    : "pointer-events-none opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                }
                onClick={() => setUiLanguage(locale.code as SupportedLocale)}
              >
                {active
                  ? t("language.active")
                  : t("language.setActive")}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
