import type { AnimatedBackground } from "@/types/slide"
import type { SlideBackground } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { placeholderTextEl } from "./_shared"

// The built-in Song *look library* (themeredo.md, 3C). The old `SlideTheme`
// song catalog — three static looks (Worship Lyrics, Lyric Glow, Hymnal) plus
// seven animated presets (Aurora … Flowing Grace) — is recreated here as
// type-first `Theme`s so the picker/generator keep the same variety they had
// under the retired model. Each is a single styled slide carrying one
// `role:"lyrics"` placeholder; the animated looks bake their `AnimatedBackground`
// preset onto the background and give the lyric text a palette-tuned glow +
// line-by-line reveal, exactly as the legacy `makeAnimatedSongTheme` did.
//
// `SONG_BUILTIN` (builtins/song.ts) stays the generic default; these are the
// extra named looks. The legacy-id alias maps each old song id to the specific
// look here so a persisted `themeId` renders what the user actually picked.

/** The shared shell for every library song theme (metadata is deterministic). */
function songTheme(t: {
  id: string
  name: string
  background: SlideBackground
  lyric: Parameters<typeof placeholderTextEl>[3]
}): Theme {
  return {
    id: t.id,
    name: t.name,
    type: "song",
    builtin: true,
    pinned: false,
    createdAt: 0,
    updatedAt: 0,
    resolution: { ...DEFAULT_THEME_RESOLUTION },
    background: t.background,
    elements: [
      placeholderTextEl(
        "lyrics-placeholder",
        "lyrics",
        { x: 5, y: 15, width: 90, height: 70 },
        // Sample lyric so the placeholder is visible while authoring/in thumbnails;
        // the current lyric lines replace it at go-live (a per-look `lyric` may
        // still override).
        { text: "Verse lyrics here", ...t.lyric }
      ),
    ],
  }
}

/**
 * An animated song look: a full-slide {@link AnimatedBackground} preset with the
 * lyric text glowing in the palette and revealing line-by-line — the direct
 * port of the legacy `ANIMATED_SONG_THEMES` entries.
 */
function animatedSongTheme(t: {
  id: string
  name: string
  animated: AnimatedBackground
  textColor: string
  glow: string
  fontFamily?: string
}): Theme {
  return songTheme({
    id: t.id,
    name: t.name,
    background: { type: "animated", animated: t.animated },
    lyric: {
      fontFamily: t.fontFamily ?? "Inter",
      fontSize: 52,
      fontWeight: 600,
      color: t.textColor,
      lineHeight: 1.4,
      shadow: { offsetX: 0, offsetY: 0, blur: 24, color: t.glow },
      textBuild: {
        type: "line-by-line",
        duration: 320,
        delay: 0,
        reveal: "fade-up",
      },
    },
  })
}

/** Lyric Glow — radial indigo wash with a soft indigo text glow. */
const LYRIC_GLOW: Theme = songTheme({
  id: "builtin-song-lyric-glow",
  name: "Lyric Glow",
  background: {
    type: "gradient",
    gradient: {
      type: "radial",
      stops: [
        { offset: 0, color: "#1e1b4b" },
        { offset: 1, color: "#0f172a" },
      ],
    },
  },
  lyric: {
    fontFamily: "Inter",
    fontSize: 52,
    fontWeight: 600,
    color: "#e0e7ff",
    lineHeight: 1.4,
    shadow: { offsetX: 0, offsetY: 0, blur: 20, color: "rgba(99,102,241,0.5)" },
  },
})

/** Hymnal — warm serif lyrics on a near-black stone ground. */
const HYMNAL: Theme = songTheme({
  id: "builtin-song-hymnal",
  name: "Hymnal",
  background: { type: "solid", color: "#1c1917" },
  lyric: {
    fontFamily: "Georgia",
    fontSize: 48,
    fontWeight: 400,
    color: "#fef3c7",
    lineHeight: 1.5,
  },
})

/** The seven animated worship looks, in their original order. */
const ANIMATED_SONG_BUILTINS: Theme[] = [
  animatedSongTheme({
    id: "builtin-song-aurora",
    name: "Aurora Worship",
    animated: {
      preset: "aurora",
      palette: ["#4c1d95", "#1e3a8a", "#0ea5e9"],
      speed: 1,
      intensity: 0.6,
      baseColor: "#0b1020",
    },
    textColor: "#f0f9ff",
    glow: "rgba(14,165,233,0.45)",
  }),
  animatedSongTheme({
    id: "builtin-song-bokeh",
    name: "Golden Bokeh",
    animated: {
      preset: "bokeh",
      palette: ["#f59e0b", "#fbbf24", "#fde68a"],
      speed: 0.8,
      intensity: 0.7,
      baseColor: "#1a1206",
    },
    textColor: "#fffbeb",
    glow: "rgba(251,191,36,0.4)",
  }),
  animatedSongTheme({
    id: "builtin-song-embers",
    name: "Ember Glow",
    animated: {
      preset: "embers",
      palette: ["#f97316", "#ef4444", "#fbbf24"],
      speed: 1,
      intensity: 0.7,
      baseColor: "#1a0a05",
    },
    textColor: "#fff7ed",
    glow: "rgba(249,115,22,0.45)",
  }),
  animatedSongTheme({
    id: "builtin-song-starfield",
    name: "Starry Host",
    animated: {
      preset: "starfield",
      palette: ["#e0e7ff", "#a5b4fc", "#c7d2fe"],
      speed: 1,
      intensity: 0.8,
      baseColor: "#060814",
    },
    textColor: "#eef2ff",
    glow: "rgba(165,180,252,0.4)",
  }),
  animatedSongTheme({
    id: "builtin-song-snow",
    name: "Silent Night",
    animated: {
      preset: "snow",
      palette: ["#e0f2fe", "#bae6fd", "#f0f9ff"],
      speed: 0.9,
      intensity: 0.7,
      baseColor: "#0b1a2b",
    },
    textColor: "#f8fafc",
    glow: "rgba(186,230,253,0.4)",
  }),
  animatedSongTheme({
    id: "builtin-song-godrays",
    name: "Light of the World",
    animated: {
      preset: "godrays",
      palette: ["#fde68a", "#fca5a5", "#fef3c7"],
      speed: 0.8,
      intensity: 0.7,
      baseColor: "#12100a",
    },
    textColor: "#fffdf5",
    glow: "rgba(253,230,138,0.45)",
  }),
  animatedSongTheme({
    id: "builtin-song-drift",
    name: "Flowing Grace",
    animated: {
      preset: "gradient-drift",
      palette: ["#0f766e", "#1e3a8a", "#6d28d9"],
      speed: 0.7,
      intensity: 0.9,
      baseColor: "#050b12",
    },
    textColor: "#f0fdfa",
    glow: "rgba(45,212,191,0.4)",
  }),
]

/**
 * The extra named Song looks beyond the generic `SONG_BUILTIN`: two static
 * (Lyric Glow, Hymnal) + the seven animated presets. `SONG_BUILTIN` itself —
 * the dark-solid default — stands in for the old "Worship Lyrics" look.
 */
export const SONG_LIBRARY_BUILTINS: Theme[] = [
  LYRIC_GLOW,
  HYMNAL,
  ...ANIMATED_SONG_BUILTINS,
]
