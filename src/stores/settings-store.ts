import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { SongSlideOptions } from "@/types/song"
import { DEFAULT_SONG_SLIDE_OPTIONS } from "@/lib/song/song-to-slides"
import { SCRIPTURE_BUILTIN } from "@/lib/theme/builtins"
import { setAnalyticsEnabled } from "@/services/analytics-gateway"
import {
  changeLanguage,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@/lib/i18n/config"

type MediaImportMode = "reference" | "copy"

/** Automatic destination for finalized, directly spoken verse references. */
export type DirectVerseDestination = "live" | "preview" | "detection"

function isDirectVerseDestination(
  value: unknown
): value is DirectVerseDestination {
  return value === "live" || value === "preview" || value === "detection"
}

/** Schedule "All" tab layout: flat list vs. thumbnail grid. */
export type ScheduleViewMode = "list" | "thumbnail"

interface SettingsState {
  uiLanguage: SupportedLocale
  geniusApiKey: string | null
  openaiApiKey: string | null
  claudeApiKey: string | null
  audioDeviceId: string | null
  gain: number
  confidenceThreshold: number
  cooldownMs: number
  onboardingComplete: boolean
  /**
   * Where finalized direct verse references are routed automatically.
   * Detection mode keeps the result in the AI Detections panel so the operator
   * can choose Present, Preview, or Queue for each result.
   */
  directVerseDestination: DirectVerseDestination
  semanticAutoQueue: boolean
  /**
   * Where a spoken navigation command ("turn to the next verse", "go back one
   * verse") sends its target verse. `false` (default) stages it to Program
   * preview for the operator to take deliberately — safe against a misheard
   * command flipping the audience screen. `true` pushes it straight to the
   * audience, hands-free. Independent of `directVerseDestination`, which governs
   * spoken *references* rather than navigation.
   */
  navAutoLive: boolean
  /**
   * Where a spoken *schedule* navigation command ("next slide", "go back to the
   * previous slide") sends the stepped item. `true` (default) pushes the newly
   * active slide straight to the audience, hands-free; `false` stages it into
   * Program preview for the operator to take. Independent of `navAutoLive`,
   * which governs verse navigation — schedule commands step the schedule list
   * (items and their sub-slides), not verses.
   */
  scheduleNavAutoLive: boolean
  /**
   * Reject schedule items whose content already appears in the schedule,
   * flash-highlighting the existing one instead of adding a second copy.
   */
  preventDuplicateScheduleItems: boolean
  /**
   * How imported media is stored. "reference" (default) keeps only the original
   * file path — zero disk overhead, but breaks if the original is moved/deleted.
   * "copy" copies each imported file into the app-managed library folder so the
   * library is self-contained and survives the originals moving.
   */
  mediaImportMode: MediaImportMode
  /**
   * Greek/Hebrew interlinear lexicon. The data is bundled with KJV but the
   * feature ships installed-but-disabled: when false, the per-verse He/Gr
   * interlinear affordance is hidden everywhere (verse panel + the controls
   * that push a lexicon card to program preview). Enabling it is a pure display
   * toggle over already-present data — no download, no reload.
   */
  lexiconEnabled: boolean
  /**
   * Global default auto-slide options for songs (design doc §9). Each song may
   * override individual fields via `Song.slideOptions`; the generator receives
   * the merged, fully-resolved value.
   */
  songSlideDefaults: SongSlideOptions

  /**
   * Global default Scripture theme id — the look new outputs adopt and the one
   * the "Default Scripture Theme" setting drives. Scripture themes are otherwise
   * chosen per broadcast output; this is the app-wide default (the song analogue
   * is `songSlideDefaults.themeId`).
   */
  scriptureDefaultThemeId: string

  /**
   * Anonymous usage analytics opt-out. `true` (default) sends fixed event names
   * and small enum properties to Aptabase — never scripture text, church names,
   * or any PII (see `services/analytics-gateway.ts`). When `false`, nothing is
   * sent. Mirrored down to the gateway on hydration and on every change.
   */
  telemetryEnabled: boolean

  /**
   * The operator's chosen layout for the schedule "All" tab. Persisted so it
   * survives switching between schedule tabs (Radix unmounts the inactive tab)
   * and app restarts — it changes only when the operator toggles it, never on
   * remount.
   */
  scheduleViewMode: ScheduleViewMode

  /**
   * When on, saving a verse edit (from the Bible panel's verse editor or the
   * multi-verse editor) also pushes the edited block straight to the live
   * output, not just into the schedule. Operator preference; persisted.
   */
  verseEditGoLive: boolean

  setGeniusApiKey: (key: string | null) => void
  setUiLanguage: (locale: SupportedLocale) => void
  setOpenaiApiKey: (key: string | null) => void
  setClaudeApiKey: (key: string | null) => void
  setAudioDeviceId: (id: string | null) => void
  setGain: (gain: number) => void
  setConfidenceThreshold: (threshold: number) => void
  setCooldownMs: (ms: number) => void
  setOnboardingComplete: (complete: boolean) => void
  setDirectVerseDestination: (destination: DirectVerseDestination) => void
  setSemanticAutoQueue: (enabled: boolean) => void
  setNavAutoLive: (enabled: boolean) => void
  setScheduleNavAutoLive: (enabled: boolean) => void
  setPreventDuplicateScheduleItems: (enabled: boolean) => void
  setMediaImportMode: (mode: MediaImportMode) => void
  setLexiconEnabled: (enabled: boolean) => void
  setSongSlideDefaults: (options: SongSlideOptions) => void
  setScriptureDefaultThemeId: (themeId: string) => void
  setTelemetryEnabled: (enabled: boolean) => void
  setScheduleViewMode: (mode: ScheduleViewMode) => void
  setVerseEditGoLive: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  uiLanguage: "en",
  geniusApiKey: null,
  openaiApiKey: null,
  claudeApiKey: null,
  audioDeviceId: null,
  gain: 1.0,
  confidenceThreshold: 0.65,
  cooldownMs: 2500,
  onboardingComplete: false,
  directVerseDestination: "preview",
  semanticAutoQueue: false,
  navAutoLive: false,
  scheduleNavAutoLive: true,
  preventDuplicateScheduleItems: true,
  mediaImportMode: "reference",
  lexiconEnabled: false,
  songSlideDefaults: DEFAULT_SONG_SLIDE_OPTIONS,
  scriptureDefaultThemeId: SCRIPTURE_BUILTIN.id,
  telemetryEnabled: true,
  scheduleViewMode: "list",
  verseEditGoLive: false,

  setGeniusApiKey: (geniusApiKey) => set({ geniusApiKey }),
  setUiLanguage: (uiLanguage) => set({ uiLanguage }),
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
  setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
  setAudioDeviceId: (audioDeviceId) => set({ audioDeviceId }),
  setGain: (gain) => set({ gain }),
  setConfidenceThreshold: (confidenceThreshold) => set({ confidenceThreshold }),
  setCooldownMs: (cooldownMs) => set({ cooldownMs }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  setDirectVerseDestination: (directVerseDestination) =>
    set({ directVerseDestination }),
  setSemanticAutoQueue: (semanticAutoQueue) => set({ semanticAutoQueue }),
  setNavAutoLive: (navAutoLive) => set({ navAutoLive }),
  setScheduleNavAutoLive: (scheduleNavAutoLive) => set({ scheduleNavAutoLive }),
  setPreventDuplicateScheduleItems: (preventDuplicateScheduleItems) =>
    set({ preventDuplicateScheduleItems }),
  setMediaImportMode: (mediaImportMode) => set({ mediaImportMode }),
  setLexiconEnabled: (lexiconEnabled) => set({ lexiconEnabled }),
  setSongSlideDefaults: (songSlideDefaults) => set({ songSlideDefaults }),
  setScriptureDefaultThemeId: (scriptureDefaultThemeId) =>
    set({ scriptureDefaultThemeId }),
  setTelemetryEnabled: (telemetryEnabled) => set({ telemetryEnabled }),
  setScheduleViewMode: (scheduleViewMode) => set({ scheduleViewMode }),
  setVerseEditGoLive: (verseEditGoLive) => set({ verseEditGoLive }),
}))

const PERSISTED_KEYS = [
  "uiLanguage",
  "geniusApiKey",
  "openaiApiKey",
  "claudeApiKey",
  "audioDeviceId",
  "gain",
  "confidenceThreshold",
  "cooldownMs",
  "onboardingComplete",
  "directVerseDestination",
  "semanticAutoQueue",
  "navAutoLive",
  "scheduleNavAutoLive",
  "preventDuplicateScheduleItems",
  "mediaImportMode",
  "lexiconEnabled",
  "songSlideDefaults",
  "scriptureDefaultThemeId",
  "telemetryEnabled",
  "scheduleViewMode",
  "verseEditGoLive",
] as const satisfies readonly (keyof SettingsState)[]

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("settings.json", { autoSave: false, defaults: {} })
  }
  return tauriStore
}

/** Load all persisted settings into the Zustand store. Idempotent and
 *  safe against concurrent callers — the first call owns the work and
 *  subsequent callers await the same promise. */
export function hydrateSettings(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getStore()
      const patch: Partial<SettingsState> = {}
      for (const key of PERSISTED_KEYS) {
        const value = await store.get(key)
        if (value !== undefined && value !== null) {
          ;(patch as Record<string, unknown>)[key] = value
        }
      }

      // Migrate the former boolean setting without changing the behavior
      // existing users selected: true was Live, false was Program Preview.
      const persistedDestination = patch.directVerseDestination
      if (!isDirectVerseDestination(persistedDestination)) {
        const legacyDirectVerseToLive = await store.get("directVerseToLive")
        if (typeof legacyDirectVerseToLive === "boolean") {
          patch.directVerseDestination = legacyDirectVerseToLive
            ? "live"
            : "preview"
          await store.set(
            "directVerseDestination",
            patch.directVerseDestination
          )
          await store.save()
        } else if (persistedDestination !== undefined) {
          delete patch.directVerseDestination
        }
      }

      // On the first run, use a supported OS language. Subsequent launches
      // always honor the saved explicit choice instead of the OS setting.
      const savedLanguage = patch.uiLanguage
      const uiLanguage = resolveSupportedLocale(
        typeof savedLanguage === "string"
          ? savedLanguage
          : typeof navigator === "undefined"
            ? undefined
            : navigator.language
      )
      if (savedLanguage !== uiLanguage) {
        patch.uiLanguage = uiLanguage
        await store.set("uiLanguage", uiLanguage)
        await store.save()
      }

      if (Object.keys(patch).length > 0) {
        useSettingsStore.setState(patch)
      }

      // Sync detection settings to the backend merger on first hydration
      syncDetectionSettings(useSettingsStore.getState())

      // Mirror the analytics opt-out down to the gateway before any event fires.
      setAnalyticsEnabled(useSettingsStore.getState().telemetryEnabled)

      // The locale string stays serializable in Zustand; i18next owns its
      // runtime state and is synchronized only at hydration and on changes.
      await changeLanguage(useSettingsStore.getState().uiLanguage)

      // Attach only after successful hydration so as not to overwrite disk with defaults.
      // Debounce writes, so a dragged slider (e.g. gain) coalesces into a single disk write.
      useSettingsStore.subscribe((state, prevState) => {
        const changed = PERSISTED_KEYS.some((k) => state[k] !== prevState[k])
        if (!changed) return

        // Sync detection-related settings to backend immediately. Only the
        // cooldown crosses to Rust: the confidence threshold is a frontend
        // panel filter (it gates which SEMANTIC suggestions appear in the AI
        // Detections panel) and must NOT raise the backend emit floor, or it
        // would also drop legitimate direct references before they arrive.
        if (state.cooldownMs !== prevState.cooldownMs) {
          syncDetectionSettings(state)
        }

        // Mirror analytics opt-out toggles down to the gateway immediately.
        if (state.telemetryEnabled !== prevState.telemetryEnabled) {
          setAnalyticsEnabled(state.telemetryEnabled)
        }

        if (state.uiLanguage !== prevState.uiLanguage) {
          void changeLanguage(state.uiLanguage)
        }

        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          pendingSave = pendingSave.then(() =>
            persistAll(useSettingsStore.getState())
          )
        }, SAVE_DEBOUNCE_MS)
      })
    } catch {
      console.warn("[settings] Failed to load persisted state, using defaults")
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 250

function syncDetectionSettings(state: SettingsState) {
  invoke("update_detection_settings", {
    cooldownMs: state.cooldownMs,
  }).catch(() => {
    // Backend may not be ready yet during early hydration
  })
}

/** Flush any pending debounced save immediately. Call before app exit. */
export function flushSettings(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    pendingSave = pendingSave.then(() =>
      persistAll(useSettingsStore.getState())
    )
  }
  return pendingSave
}

async function persistAll(state: SettingsState): Promise<void> {
  try {
    const store = await getStore()
    for (const key of PERSISTED_KEYS) {
      const value = state[key]
      if (value === undefined) continue
      await store.set(key, value as unknown)
    }
    await store.save()
  } catch {
    console.warn("[settings] Failed to persist settings")
  }
}
