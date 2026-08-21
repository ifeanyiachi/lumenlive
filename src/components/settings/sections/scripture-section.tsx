import { useMemo } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore } from "@/stores"
import { useThemesStore } from "@/stores/themes"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { BUILTIN_THEMES } from "@/lib/theme/builtins"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"

const SCRIPTURE_THEME_OPTIONS = BUILTIN_THEMES.filter(
  (t) => t.type === "scripture"
)

/**
 * Scripture defaults. The one setting today is the default Scripture theme —
 * the look scripture is shown with. Scripture themes are otherwise chosen per
 * broadcast output; picking one here sets it as the app-wide default and applies
 * it to the Program output immediately so the change is live.
 */
export function ScriptureSection() {
  const defaultThemeId = useSettingsStore((s) => s.scriptureDefaultThemeId)
  const setDefaultThemeId = useSettingsStore((s) => s.setScriptureDefaultThemeId)
  const customThemes = useThemesStore((s) => s.customThemes)
  // Built-in scripture looks plus any user-authored custom scripture themes.
  const scriptureThemeOptions = useMemo(
    () => [
      ...SCRIPTURE_THEME_OPTIONS,
      ...customThemes.filter((t) => t.type === "scripture"),
    ],
    [customThemes]
  )

  const onChange = (themeId: string) => {
    setDefaultThemeId(themeId)
    // Apply to the Program output so the new default is live immediately; each
    // output can still override its own scripture theme in Broadcast settings.
    useBroadcastStore.getState().setActiveTheme(themeId)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
        The theme scripture verses are shown with. Each output can override this
        in Broadcast settings; changing it here sets the app-wide default and
        applies it to the Program output.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Default Scripture Theme
        </label>
        <Select
          value={resolveLegacyThemeId(defaultThemeId)}
          onValueChange={onChange}
        >
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scriptureThemeOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
