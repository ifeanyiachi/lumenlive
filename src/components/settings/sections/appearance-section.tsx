import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/stores/settings-store"
import {
  INTERFACE_SCALES,
  type InterfaceDensity,
} from "@/lib/interface-appearance"

const DENSITIES: InterfaceDensity[] = ["compact", "standard", "comfortable"]

export function AppearanceSection() {
  const { t } = useTranslation("settings")
  const scale = useSettingsStore((s) => s.interfaceScale)
  const density = useSettingsStore((s) => s.interfaceDensity)
  const setScale = useSettingsStore((s) => s.setInterfaceScale)
  const setDensity = useSettingsStore((s) => s.setInterfaceDensity)
  const reset = useSettingsStore((s) => s.resetInterfaceAppearance)

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("appearance.description")}
      </p>
      <div className="flex flex-col gap-2">
        <h2 id="interface-size-label" className="text-sm font-medium">
          {t("appearance.size")}
        </h2>
        <p
          id="interface-size-description"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {t("appearance.sizeDescription")}
        </p>
        <RadioGroup
          id="interface-size"
          aria-labelledby="interface-size-label"
          aria-describedby="interface-size-description"
          value={String(scale)}
          onValueChange={(value) => setScale(Number(value))}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {INTERFACE_SCALES.map((value) => (
            <label
              key={value}
              htmlFor={`interface-size-${value}`}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/60",
                scale === value && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem
                id={`interface-size-${value}`}
                value={String(value)}
              />
              <span className="text-xs font-medium text-foreground">
                {value}%{value === 100 ? ` (${t("appearance.default")})` : ""}
              </span>
            </label>
          ))}
        </RadioGroup>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("appearance.shortcuts")}
        </p>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          {t("appearance.density")}
        </legend>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("appearance.densityDescription")}
        </p>
        <RadioGroup
          value={density}
          onValueChange={(value) => setDensity(value as InterfaceDensity)}
          aria-label={t("appearance.density")}
          className="grid gap-2 sm:grid-cols-3"
        >
          {DENSITIES.map((value) => (
            <label
              key={value}
              htmlFor={`interface-density-${value}`}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2.5 transition-colors hover:bg-muted/60",
                density === value && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem id={`interface-density-${value}`} value={value} />
              <span className="text-xs font-medium text-foreground">
                {t(`appearance.densities.${value}`)}
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <section
        aria-label={t("appearance.preview")}
        className="flex flex-col gap-3 rounded-lg border border-border p-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{t("appearance.preview")}</span>
          <Badge variant="secondary">{t("appearance.previewBadge")}</Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("appearance.previewText")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t("appearance.previewInput")}
            placeholder={t("appearance.previewInput")}
            readOnly
            className="w-full sm:w-48"
          />
          <Button variant="outline">{t("appearance.previewButton")}</Button>
        </div>
      </section>
      <div>
        <Button
          variant="outline"
          disabled={scale === 100 && density === "standard"}
          onClick={reset}
        >
          {t("appearance.reset")}
        </Button>
      </div>
    </div>
  )
}
