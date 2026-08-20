import { create } from "zustand"
import type { Theme } from "@/types/theme"
import { buildThemeRegistry, findThemeById } from "@/lib/theme/registry"
import { ingestLegacyThemes } from "@/lib/theme/migrate"
import {
  hasIngestedLegacy,
  loadLegacyThemeSources,
  loadStoredThemes,
  markLegacyIngested,
  saveThemes,
} from "@/services/theme-store-gateway"

/**
 * The one theme store for the type-first model (themeredo.md, Phase 1).
 *
 * Holds only the user's **custom** themes as serializable plain data; built-ins
 * live in code (`lib/theme/builtins`) and are never persisted. Orchestration
 * only — the real logic (registry merge, validation, construction) lives in
 * `lib/theme/**`. Persistence is debounced through the `themes.json` gateway,
 * attached after hydration so defaults never overwrite disk.
 *
 * Introduced additively: nothing user-facing reads this store until Phase 3.
 */

interface ThemesState {
  customThemes: Theme[]

  /** The full library (built-ins + customs). */
  allThemes: () => Theme[]
  /** Look up a theme by id across built-ins + customs. */
  getThemeById: (id: string) => Theme | undefined

  /** Insert a new custom theme (or replace one with the same id). */
  upsertTheme: (theme: Theme) => void
  /** Patch a custom theme in place; no-op if the id is unknown. */
  updateTheme: (id: string, patch: Partial<Theme>) => void
  renameTheme: (id: string, name: string) => void
  setThemePinned: (id: string, pinned: boolean) => void
  deleteTheme: (id: string) => void
}

export const useThemesStore = create<ThemesState>((set, get) => ({
  customThemes: [],

  allThemes: () => buildThemeRegistry(get().customThemes),
  getThemeById: (id) => findThemeById(get().customThemes, id),

  upsertTheme: (theme) =>
    set((state) => {
      // Custom themes are never built-in; normalize defensively.
      const normalized: Theme = { ...theme, builtin: false }
      const exists = state.customThemes.some((t) => t.id === normalized.id)
      return {
        customThemes: exists
          ? state.customThemes.map((t) =>
              t.id === normalized.id ? normalized : t
            )
          : [...state.customThemes, normalized],
      }
    }),

  updateTheme: (id, patch) =>
    set((state) => ({
      customThemes: state.customThemes.map((t) =>
        t.id === id ? { ...t, ...patch, id: t.id, builtin: false } : t
      ),
    })),

  renameTheme: (id, name) =>
    set((state) => ({
      customThemes: state.customThemes.map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    })),

  setThemePinned: (id, pinned) =>
    set((state) => ({
      customThemes: state.customThemes.map((t) =>
        t.id === id ? { ...t, pinned } : t
      ),
    })),

  deleteTheme: (id) =>
    set((state) => ({
      customThemes: state.customThemes.filter((t) => t.id !== id),
    })),
}))

// ── Hydration + debounced persistence ──

let hydrationPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 250

/**
 * Run the one-time legacy ingest (themeredo.md, Phase 5b): fold the old
 * `BroadcastTheme` + `SlideTheme` customs into the new store the first time this
 * build runs, then set a persisted marker so a user's later deletions are never
 * re-imported. Merges onto whatever was just hydrated and persists the result
 * *before* the debounced subscriber is attached, so the ingest write is
 * deterministic (not racing the debounce). Never throws — a failure leaves the
 * store as-is and simply retries next boot.
 */
async function ingestLegacyThemesOnce(): Promise<void> {
  try {
    if (await hasIngestedLegacy()) return
    const sources = await loadLegacyThemeSources()
    const existing = useThemesStore.getState().customThemes
    const { themes, added } = ingestLegacyThemes(
      sources,
      existing,
      () => crypto.randomUUID(),
      Date.now()
    )
    if (added > 0) {
      useThemesStore.setState({ customThemes: themes })
      await saveThemes(themes)
    }
    await markLegacyIngested()
  } catch {
    console.warn("[themes] Legacy ingest failed; will retry next launch")
  }
}

/**
 * Load persisted custom themes into the store, then attach a debounced saver.
 * Idempotent and safe against concurrent callers — the first call owns the work
 * and later callers await the same promise. Attaching the subscriber only after
 * a successful load avoids writing default (empty) state back over disk.
 */
export function hydrateThemes(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const stored = await loadStoredThemes()
      if (stored) useThemesStore.setState({ customThemes: stored })
    } catch {
      console.warn("[themes] Failed to load persisted themes, using defaults")
    }

    await ingestLegacyThemesOnce()

    useThemesStore.subscribe((state, prev) => {
      if (state.customThemes === prev.customThemes) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        pendingSave = pendingSave.then(() =>
          saveThemes(useThemesStore.getState().customThemes)
        )
      }, SAVE_DEBOUNCE_MS)
    })
  })()
  return hydrationPromise
}

/** Flush any pending debounced save immediately. Call before app exit. */
export function flushThemes(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    pendingSave = pendingSave.then(() =>
      saveThemes(useThemesStore.getState().customThemes)
    )
  }
  return pendingSave
}
