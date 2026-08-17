import { useMemo } from "react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSettingsStore } from "@/stores"
import { usePresentationStore } from "@/stores/presentation-store"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"

import { ApiKeyField } from "../ui/api-key-field"
import { useApiKeyField } from "../hooks/use-api-key-field"

const SONG_THEME_OPTIONS = BUILTIN_SLIDE_THEMES.filter(
  (t) => t.category === "song"
)

export function SongsSection() {
  const defaults = useSettingsStore((s) => s.songSlideDefaults)
  const setDefaults = useSettingsStore((s) => s.setSongSlideDefaults)
  const customSlideThemes = usePresentationStore((s) => s.customSlideThemes)
  // Built-in song themes plus any user-authored custom ones (Phase 3d).
  const songThemeOptions = useMemo(
    () => [
      ...SONG_THEME_OPTIONS,
      ...customSlideThemes.filter((t) => t.category === "song"),
    ],
    [customSlideThemes]
  )
  const geniusApiKey = useSettingsStore((s) => s.geniusApiKey)
  const setGeniusApiKey = useSettingsStore((s) => s.setGeniusApiKey)
  const update = (patch: Partial<typeof defaults>) =>
    setDefaults({ ...defaults, ...patch })

  const geniusKeyField = useApiKeyField(geniusApiKey, setGeniusApiKey)

  const toggles: {
    key: keyof typeof defaults
    label: string
    description: string
  }[] = [
    {
      key: "breakOnBlankLines",
      label: "Break on blank lines",
      description:
        "Start a new slide at stanza breaks, even under the line cap.",
    },
    {
      key: "includeTitleSlide",
      label: "Title slide",
      description: "Prepend a slide with the song title and author.",
    },
    {
      key: "includeBlankEndSlide",
      label: "Blank end slide",
      description: "Append a blank slide so the last click clears the screen.",
    },
    {
      key: "showSectionLabels",
      label: "Show section labels",
      description: 'Overlay a small "Verse 1" / "Chorus" badge on each slide.',
    },
    {
      key: "transparentBackground",
      label: "Transparent background",
      description:
        "Replace the theme background with transparency, for keying lyrics over live video.",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Genius API key — powers lyric-line search in "Search Online Lyrics" */}
      <ApiKeyField
        label="Genius API Key"
        placeholder="Enter your Genius API key..."
        configured={!!geniusApiKey}
        field={geniusKeyField}
        instructionsTitle="How to get a Genius API key"
        helpText="Enables Genius results (including lyric-line matches) in the online lyrics search. Stored locally on this device. Other sources work without a key."
      >
        <ol className="ml-3.5 list-decimal space-y-0.5 text-[0.625rem] leading-relaxed text-muted-foreground">
          <li>
            Sign in at{" "}
            <span className="font-mono text-foreground">
              genius.com/api-clients
            </span>{" "}
            (a free Genius account).
          </li>
          <li>
            Click{" "}
            <span className="font-medium text-foreground">New API Client</span>,
            fill in any app name and URL, then create it.
          </li>
          <li>
            On the client, click{" "}
            <span className="font-medium text-foreground">
              Generate Access Token
            </span>
            , copy the token, paste it above, and press{" "}
            <span className="font-medium text-foreground">Save</span>.
          </li>
        </ol>
      </ApiKeyField>

      <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
        Defaults used when a song is turned into slides. Any song can override
        these in its editor; changing them here only affects songs that haven't
        been customised.
      </p>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Default Lyric Theme
        </label>
        <Select
          value={defaults.themeId}
          onValueChange={(v) => update({ themeId: v })}
        >
          <SelectTrigger className="w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {songThemeOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Lines Per Slide
        </label>
        <Input
          type="number"
          min={1}
          max={12}
          value={defaults.maxLinesPerSlide}
          onChange={(e) => {
            const n = Math.max(
              1,
              Math.min(12, Math.round(Number(e.target.value) || 1))
            )
            update({ maxLinesPerSlide: n })
          }}
          className="w-24 text-sm"
        />
      </div>

      <div className="flex flex-col gap-3">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {t.label}
              </span>
              <p className="text-[0.625rem] leading-relaxed text-muted-foreground">
                {t.description}
              </p>
            </div>
            <Switch
              checked={defaults[t.key] as boolean}
              onCheckedChange={(v) => update({ [t.key]: v })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
