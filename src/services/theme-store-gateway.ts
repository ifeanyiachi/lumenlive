import { load, type Store } from "@tauri-apps/plugin-store"
import type { BroadcastTheme } from "@/types/broadcast"
import type { SlideTheme } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import type { LegacyThemeSources } from "@/lib/theme/migrate"

/**
 * Tauri plugin-store gateway for the type-first theme model (themeredo.md,
 * Phase 1).
 *
 * All plugin-store I/O for themes lives here, behind typed functions, so the
 * store slice never imports `@tauri-apps/plugin-store` directly. This replaces
 * the dual persistence of the old world (`broadcast-themes.json` `customThemes`
 * + `presentations.json` `customSlideThemes`) with one file, `themes.json`,
 * holding only user-authored themes — built-ins live in code and are never
 * persisted.
 */

const THEMES_FILE = "themes.json"
const CUSTOM_THEMES_KEY = "customThemes"
/** Marks that the one-time legacy ingest (Phase 5b) already ran. */
const LEGACY_INGESTED_KEY = "legacyIngested"

// The two legacy plugin-store files the one-time ingest reads from (read-only).
const LEGACY_BROADCAST_FILE = "broadcast-themes.json"
const LEGACY_PRESENTATIONS_FILE = "presentations.json"
const LEGACY_BROADCAST_KEY = "customThemes"
const LEGACY_SLIDE_KEY = "customSlideThemes"

const THEME_TYPES: readonly ThemeType[] = [
  "scripture",
  "song",
  "countdown",
  "sermon",
  "overlay",
  "announcement",
]

let tauriStore: Store | null = null

async function getThemeStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load(THEMES_FILE, { autoSave: false, defaults: {} })
  }
  return tauriStore
}

/**
 * Structural check for one persisted theme. Guards the shape the model +
 * renderer rely on, so a single truncated / hand-edited / foreign record can be
 * dropped rather than taking the whole library down.
 */
function isStructurallyValidTheme(value: unknown): value is Theme {
  if (!value || typeof value !== "object") return false
  const t = value as Record<string, unknown>
  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.type === "string" &&
    THEME_TYPES.includes(t.type as ThemeType) &&
    typeof t.background === "object" &&
    t.background !== null &&
    Array.isArray(t.elements) &&
    t.elements.every((el) => el != null && typeof el === "object")
  )
}

/** Load persisted custom themes, or `null` when there are none. */
export async function loadStoredThemes(): Promise<Theme[] | null> {
  const store = await getThemeStore()
  const raw = await store.get(CUSTOM_THEMES_KEY)
  if (!Array.isArray(raw) || raw.length === 0) return null

  const valid = raw.filter(isStructurallyValidTheme)
  const dropped = raw.length - valid.length
  if (dropped > 0) {
    console.warn(
      `[themes] Skipped ${dropped} malformed theme record(s) while loading`
    )
  }
  if (valid.length === 0) return null
  // Custom themes are never built-in; normalize the flag defensively.
  return valid.map((t) => ({ ...t, builtin: false }))
}

/** Persist the current custom themes, swallowing errors by convention. */
export async function saveThemes(themes: Theme[]): Promise<void> {
  try {
    const store = await getThemeStore()
    await store.set(CUSTOM_THEMES_KEY, themes)
    await store.save()
  } catch {
    console.warn("[themes] Failed to persist custom themes")
  }
}

// ── One-time legacy ingest (Phase 5b) ──
// Fold the two old custom-theme surfaces (verse/countdown `BroadcastTheme`s and
// song/slide `SlideTheme`s) into `themes.json` via the migrators. Reading those
// files is Tauri I/O, so it lives here in the gateway; the transform is pure
// `lib/theme/migrate`. Guarded by a persisted flag so a user's later deletions
// are never re-imported on the next boot.

/** True once the one-time legacy ingest has run and been marked complete. */
export async function hasIngestedLegacy(): Promise<boolean> {
  try {
    const store = await getThemeStore()
    return (await store.get(LEGACY_INGESTED_KEY)) === true
  } catch {
    // If we cannot read the marker, assume ingested — never risk a double import.
    return true
  }
}

/** Record that the one-time legacy ingest has completed. */
export async function markLegacyIngested(): Promise<void> {
  try {
    const store = await getThemeStore()
    await store.set(LEGACY_INGESTED_KEY, true)
    await store.save()
  } catch {
    console.warn("[themes] Failed to mark legacy ingest complete")
  }
}

/** Read one array key from a legacy plugin-store file, or `[]` on any failure. */
async function readLegacyArray<T>(file: string, key: string): Promise<T[]> {
  try {
    const store = await load(file, { autoSave: false, defaults: {} })
    const raw = await store.get(key)
    return Array.isArray(raw) ? (raw as T[]) : []
  } catch {
    return []
  }
}

/**
 * Read the raw custom themes from both legacy files for the one-time ingest.
 * Never throws — a missing or unreadable file contributes an empty list, so a
 * fresh install (no legacy data) ingests nothing and the marker is still set.
 */
export async function loadLegacyThemeSources(): Promise<LegacyThemeSources> {
  const [broadcast, slide] = await Promise.all([
    readLegacyArray<BroadcastTheme>(LEGACY_BROADCAST_FILE, LEGACY_BROADCAST_KEY),
    readLegacyArray<SlideTheme>(LEGACY_PRESENTATIONS_FILE, LEGACY_SLIDE_KEY),
  ])
  return { broadcast, slide }
}
