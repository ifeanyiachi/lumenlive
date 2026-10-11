import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { useThemesStore } from "@/stores/themes"
import { useSettingsStore } from "@/stores"
import { COUNTDOWN_BUILTIN } from "@/lib/theme/builtins"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { countdownThemeColors } from "@/lib/countdown/theme-colors"
import type { CountdownTimer, CountdownFormat } from "@/types/alert"
import { cn } from "@/lib/utils"

/** Quick-pick durations (seconds) offered in the editor. */
const DURATION_PRESETS = [60, 300, 600, 900, 1200]

export function TimerEditor({
  timer,
  onSave,
  onCancel,
}: {
  timer: CountdownTimer
  onSave: (timer: CountdownTimer) => void
  onCancel: () => void
}) {
  const { t } = useTranslation("countdown")
  const [draft, setDraft] = useState(timer)
  const minutes = Math.floor(draft.durationSeconds / 60)
  const seconds = draft.durationSeconds % 60

  const customThemes = useThemesStore((s) => s.customThemes)
  const otherThemeDefaultIds = useSettingsStore((s) => s.otherThemeDefaultIds)
  const countdownThemes = buildThemeRegistry(customThemes).filter(
    (t) => t.type === "countdown"
  )
  const preferredCountdownThemeId =
    otherThemeDefaultIds.countdown ?? COUNTDOWN_BUILTIN.id
  const defaultCountdownThemeId = countdownThemes.some(
    (theme) => theme.id === preferredCountdownThemeId
  )
    ? preferredCountdownThemeId
    : countdownThemes[0]?.id
  const isThemed = draft.styleMode === "theme"

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.label")}
        </span>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-7 text-xs"
        />
      </div>

      {/* Style: custom inline appearance vs. a saved countdown theme */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.style")}
        </span>
        <div className="grid grid-cols-2 gap-1">
          {(["custom", "theme"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  styleMode: mode,
                  // Auto-select a theme the first time Theme mode is chosen so
                  // the picker isn't empty; keep any prior choice otherwise.
                  themeId:
                    mode === "theme"
                      ? (draft.themeId ?? defaultCountdownThemeId)
                      : draft.themeId,
                })
              }
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs capitalize transition-colors",
                (mode === "theme") === isThemed
                  ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {t(`editor.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {isThemed && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("editor.theme")}
          </span>
          {countdownThemes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[0.625rem] text-muted-foreground">
              {t("editor.noThemes")}
            </p>
          ) : (
            <Select
              value={draft.themeId ?? ""}
              onValueChange={(value) => setDraft({ ...draft, themeId: value })}
            >
              <SelectTrigger size="sm" className="h-7 w-full text-xs">
                <SelectValue placeholder={t("editor.selectTheme")} />
              </SelectTrigger>
              <SelectContent>
                {countdownThemes.map((theme) => {
                  const colors = countdownThemeColors(theme)
                  return (
                    <SelectItem key={theme.id} value={theme.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-4 shrink-0 rounded border border-border"
                          style={{
                            backgroundColor: colors.background,
                            color: colors.text,
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{theme.name}</span>
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.mode")}
        </span>
        <Select
          value={draft.mode}
          onValueChange={(value) =>
            setDraft({ ...draft, mode: value as CountdownTimer["mode"] })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="duration">{t("editor.durationMode")}</SelectItem>
            <SelectItem value="clock">{t("editor.clockMode")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {draft.mode === "duration" ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("editor.duration")}
          </span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={minutes}
              min={0}
              max={999}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  durationSeconds: Number(e.target.value) * 60 + seconds,
                })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {t("editor.minutesShort")}
            </span>
            <Input
              type="number"
              value={seconds}
              min={0}
              max={59}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  durationSeconds: minutes * 60 + Number(e.target.value),
                })
              }
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {t("editor.secondsShort")}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {DURATION_PRESETS.map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => setDraft({ ...draft, durationSeconds: secs })}
                className={cn(
                  "rounded border border-border px-1.5 py-0.5 text-[0.625rem] text-muted-foreground transition-colors hover:bg-accent",
                  draft.durationSeconds === secs &&
                    "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                )}
              >
                {t("editor.durationPreset", { minutes: secs / 60 })}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
            {t("editor.targetTime")}
          </span>
          <Input
            type="time"
            value={draft.targetTime ?? "10:00"}
            onChange={(e) => setDraft({ ...draft, targetTime: e.target.value })}
            className="h-7 w-28 text-xs"
          />
          <span className="text-[0.625rem] text-muted-foreground">
            {t("editor.targetTimeHint")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.format")}
        </span>
        <Select
          value={draft.format}
          onValueChange={(value) =>
            setDraft({ ...draft, format: value as CountdownFormat })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mm:ss">MM:SS</SelectItem>
            <SelectItem value="hh:mm:ss">HH:MM:SS</SelectItem>
            <SelectItem value="minutes">{t("editor.minutes")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isThemed && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("editor.position")}
            </span>
            <Select
              value={draft.position}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  position: value as CountdownTimer["position"],
                })
              }
            >
              <SelectTrigger size="sm" className="h-7 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fullscreen">
                  {t("editor.fullScreen")}
                </SelectItem>
                <SelectItem value="center">{t("editor.center")}</SelectItem>
                <SelectItem value="top-left">{t("editor.topLeft")}</SelectItem>
                <SelectItem value="top-center">
                  {t("editor.topCenter")}
                </SelectItem>
                <SelectItem value="top-right">
                  {t("editor.topRight")}
                </SelectItem>
                <SelectItem value="bottom-left">
                  {t("editor.bottomLeft")}
                </SelectItem>
                <SelectItem value="bottom-center">
                  {t("editor.bottomCenter")}
                </SelectItem>
                <SelectItem value="bottom-right">
                  {t("editor.bottomRight")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              {t("editor.appearance")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[0.6875rem] text-muted-foreground">
                {t("editor.backgroundShort")}
              </span>
              <ColorSwatch
                value={
                  draft.backgroundColor.startsWith("rgba")
                    ? "#000000"
                    : draft.backgroundColor
                }
                onChange={(backgroundColor) =>
                  setDraft({ ...draft, backgroundColor })
                }
                className="size-6"
              />
              <span className="text-[0.6875rem] text-muted-foreground">
                {t("editor.textShort")}
              </span>
              <ColorSwatch
                value={draft.textColor}
                onChange={(textColor) => setDraft({ ...draft, textColor })}
                className="size-6"
              />
              <Input
                type="number"
                value={draft.fontSize}
                min={16}
                max={200}
                onChange={(e) =>
                  setDraft({ ...draft, fontSize: Number(e.target.value) })
                }
                className="h-7 w-14 text-xs"
                title={t("editor.fontSize")}
              />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.urgency")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] text-amber-500">
            {t("editor.warnAtOrBelow")}
          </span>
          <Input
            type="number"
            min={0}
            placeholder={t("editor.off")}
            value={draft.warnSeconds ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                warnSeconds:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-[0.6875rem] text-red-500">
            {t("editor.dangerAtOrBelow")}
          </span>
          <Input
            type="number"
            min={0}
            placeholder={t("editor.off")}
            value={draft.dangerSeconds ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                dangerSeconds:
                  e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            className="h-7 w-16 text-xs"
          />
          <span className="text-[0.6875rem] text-muted-foreground">
            {t("editor.secondsShort")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
          {t("editor.whenFinished")}
        </span>
        <Select
          value={draft.endAction}
          onValueChange={(value) =>
            setDraft({
              ...draft,
              endAction: value as CountdownTimer["endAction"],
            })
          }
        >
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flash">{t("editor.flash")}</SelectItem>
            <SelectItem value="overtime">{t("editor.overtime")}</SelectItem>
            <SelectItem value="hide">{t("editor.hide")}</SelectItem>
            <SelectItem value="none">{t("editor.stay")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.showLabel}
            onChange={(e) =>
              setDraft({ ...draft, showLabel: e.target.checked })
            }
          />
          {t("editor.showLabel")}
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("editor.cancel")}
        </Button>
        <Button size="sm" onClick={() => onSave(draft)}>
          {t("editor.save")}
        </Button>
      </div>
    </div>
  )
}
