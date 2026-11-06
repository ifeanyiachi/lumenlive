import { load, type Store } from "@tauri-apps/plugin-store"
import type { Theme, ThemeType } from "@/types/theme"

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
