import { useMemo } from "react"
import { RotateCcwIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore } from "@/stores/settings-store"
import { useSongStore } from "@/stores/song-store"
import { useThemesStore } from "@/stores/themes"
import { resolveSongSlideOptions } from "@/lib/song/song-to-slides"
import { BUILTIN_THEMES } from "@/lib/theme/builtins"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import type {
  SlideTransitionType,
  AnimatedBackground,
  AnimatedBackgroundPreset,
} from "@/types/slide"
import type { Theme } from "@/types/theme"
import type { Song, SongSlideOptions } from "@/types/song"

const BUILTIN_SONG_THEMES = BUILTIN_THEMES.filter((t) => t.type === "song")

const PRESET_LABELS: Record<AnimatedBackgroundPreset, string> = {
  aurora: "Aurora",
  bokeh: "Bokeh",
  embers: "Embers",
  starfield: "Starfield",
  snow: "Snow",
  godrays: "God rays",
  "gradient-drift": "Gradient drift",
}

/** The animated-background spec of a song theme, or undefined if it isn't animated. */
function themeAnimatedSpec(
  themeId: string,
  themes: Theme[]
): AnimatedBackground | undefined {
  const theme = themes.find((t) => t.id === resolveLegacyThemeId(themeId))
  return theme?.background.animated
}

const TRANSITION_LABELS: Record<SlideTransitionType, string> = {
  cut: "None (cut)",
  fade: "Fade",
  dissolve: "Dissolve",
  "push-left": "Push left",
  "push-right": "Push right",
  "wipe-left": "Wipe left",
  "wipe-right": "Wipe right",
}

/**
 * The right-pane projection options for the song editor (design doc §9). Every
 * control shows the *effective* value; fields the operator changes are stored as
 * a per-song override in `Song.slideOptions`, and a "reset" affordance appears
 * next to any field that deviates from the global default set in Settings.
 */
export function SongProjectionOptions({ song }: { song: Song }) {
  const defaults = useSettingsStore((s) => s.songSlideDefaults)
  const customThemes = useThemesStore((s) => s.customThemes)
  // Built-in song looks plus any user-authored custom song themes.
  const songThemes = useMemo(
    () => [
      ...BUILTIN_SONG_THEMES,
      ...customThemes.filter((t) => t.type === "song"),
    ],
    [customThemes]
  )
  const override = song.slideOptions ?? {}
  const resolved = resolveSongSlideOptions(defaults, song.slideOptions)

  const setField = <K extends keyof SongSlideOptions>(
    key: K,
    value: SongSlideOptions[K]
  ) => {
    useSongStore
      .getState()
      .updateSong(song.id, { slideOptions: { ...override, [key]: value } })
  }

  const resetField = (key: keyof SongSlideOptions) => {
    const next = { ...override }
    delete next[key]
    useSongStore.getState().updateSong(song.id, { slideOptions: next })
  }

  const isOverridden = (key: keyof SongSlideOptions) =>
    override[key] !== undefined

  // Animated background: shown only when the chosen theme uses one. Effective
  // spec = theme spec with any per-song override merged on top.
  const themeSpec = themeAnimatedSpec(resolved.themeId, songThemes)
  const animOverride = resolved.animatedBackground ?? {}
  const effAnim: AnimatedBackground | undefined = themeSpec
    ? { ...themeSpec, ...animOverride }
    : undefined
  const setAnim = (patch: Partial<AnimatedBackground>) =>
    setField("animatedBackground", { ...animOverride, ...patch })

  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        Projection
      </span>

      {/* Theme */}
      <Field
        label="Theme"
        overridden={isOverridden("themeId")}
        onReset={() => resetField("themeId")}
      >
        <Select
          value={resolveLegacyThemeId(resolved.themeId)}
          onValueChange={(v) => setField("themeId", v)}
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {songThemes.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Animated background — only for animated themes */}
      {effAnim && (
        <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Animated background
            </span>
            {isOverridden("animatedBackground") && (
              <ResetButton onReset={() => resetField("animatedBackground")} />
            )}
          </div>

          <Field label="Style" overridden={false} onReset={() => {}}>
            <Select
              value={effAnim.preset}
              onValueChange={(v) =>
                setAnim({ preset: v as AnimatedBackgroundPreset })
              }
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(PRESET_LABELS) as [
                    AnimatedBackgroundPreset,
                    string,
                  ][]
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Palette */}
          <div className="flex flex-col gap-1">
            <span className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
              Colors
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {effAnim.palette.map((color, i) => (
                <div key={i} className="group relative">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      const next = [...effAnim.palette]
                      next[i] = e.target.value
                      setAnim({ palette: next })
                    }}
                    className="size-7 cursor-pointer rounded border border-border"
                    aria-label={`Color ${i + 1}`}
                  />
                  {effAnim.palette.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove color ${i + 1}`}
                      onClick={() =>
                        setAnim({
                          palette: effAnim.palette.filter((_, j) => j !== i),
                        })
                      }
                      className="absolute -top-1 -right-1 hidden rounded-full bg-background text-muted-foreground shadow group-hover:block hover:text-foreground"
                    >
                      <XIcon className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              {effAnim.palette.length < 4 && (
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  aria-label="Add color"
                  onClick={() =>
                    setAnim({ palette: [...effAnim.palette, "#ffffff"] })
                  }
                >
                  <PlusIcon className="size-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Speed */}
          <SliderField
            label="Speed"
            value={effAnim.speed}
            min={0.25}
            max={2}
            step={0.05}
            format={(n) => `${n.toFixed(2)}×`}
            onChange={(n) => setAnim({ speed: n })}
          />

          {/* Intensity */}
          <SliderField
            label="Intensity"
            value={effAnim.intensity}
            min={0}
            max={1}
            step={0.05}
            format={(n) => `${Math.round(n * 100)}%`}
            onChange={(n) => setAnim({ intensity: n })}
          />
        </div>
      )}

      {/* Max lines per slide */}
      <Field
        label="Lines per slide"
        overridden={isOverridden("maxLinesPerSlide")}
        onReset={() => resetField("maxLinesPerSlide")}
      >
        <Input
          type="number"
          min={1}
          max={12}
          value={resolved.maxLinesPerSlide}
          onChange={(e) => {
            const n = Math.max(
              1,
              Math.min(12, Math.round(Number(e.target.value) || 1))
            )
            setField("maxLinesPerSlide", n)
          }}
          className="h-7 w-full text-xs"
        />
      </Field>

      {/* Lyric font size — empty input inherits the theme's own size */}
      <Field
        label="Font size"
        overridden={isOverridden("fontSize")}
        onReset={() => resetField("fontSize")}
      >
        <Input
          type="number"
          min={8}
          max={200}
          placeholder="Theme default"
          value={resolved.fontSize ?? ""}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === "") {
              setField("fontSize", null)
              return
            }
            const n = Math.max(8, Math.min(200, Math.round(Number(raw) || 8)))
            setField("fontSize", n)
          }}
          className="h-7 w-full text-xs"
        />
      </Field>

      {/* Slide animation */}
      <Field
        label="Slide animation"
        overridden={isOverridden("transition")}
        onReset={() => resetField("transition")}
      >
        <Select
          value={resolved.transition}
          onValueChange={(v) =>
            setField("transition", v as SlideTransitionType)
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(TRANSITION_LABELS) as [
                SlideTransitionType,
                string,
              ][]
            ).map(([value, label]) => (
              <SelectItem key={value} value={value} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <ToggleField
        label="Transparent background"
        checked={resolved.transparentBackground}
        overridden={isOverridden("transparentBackground")}
        onChange={(v) => setField("transparentBackground", v)}
        onReset={() => resetField("transparentBackground")}
      />
      <ToggleField
        label="Break on blank lines"
        checked={resolved.breakOnBlankLines}
        overridden={isOverridden("breakOnBlankLines")}
        onChange={(v) => setField("breakOnBlankLines", v)}
        onReset={() => resetField("breakOnBlankLines")}
      />
      <ToggleField
        label="Title slide"
        checked={resolved.includeTitleSlide}
        overridden={isOverridden("includeTitleSlide")}
        onChange={(v) => setField("includeTitleSlide", v)}
        onReset={() => resetField("includeTitleSlide")}
      />
      <ToggleField
        label="Blank end slide"
        checked={resolved.includeBlankEndSlide}
        overridden={isOverridden("includeBlankEndSlide")}
        onChange={(v) => setField("includeBlankEndSlide", v)}
        onReset={() => resetField("includeBlankEndSlide")}
      />
      <ToggleField
        label="Show section labels"
        checked={resolved.showSectionLabels}
        overridden={isOverridden("showSectionLabels")}
        onChange={(v) => setField("showSectionLabels", v)}
        onReset={() => resetField("showSectionLabels")}
      />
    </div>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-5"
      aria-label="Reset to default"
      title="Reset to default"
      onClick={onReset}
    >
      <RotateCcwIcon className="size-3" />
    </Button>
  )
}

function Field({
  label,
  overridden,
  onReset,
  children,
}: {
  label: string
  overridden: boolean
  onReset: () => void
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[0.625rem] tracking-wider text-muted-foreground uppercase">
        {label}
        {overridden && <ResetButton onReset={onReset} />}
      </span>
      {children}
    </label>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center justify-between text-[0.625rem] tracking-wider text-muted-foreground uppercase">
        {label}
        <span className="tabular-nums">{format(value)}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  )
}

function ToggleField({
  label,
  checked,
  overridden,
  onChange,
  onReset,
}: {
  label: string
  checked: boolean
  overridden: boolean
  onChange: (value: boolean) => void
  onReset: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-xs text-foreground">
        {label}
        {overridden && <ResetButton onReset={onReset} />}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
