import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { SongSlideOptions } from "@/types/song"
import { DEFAULT_SONG_SLIDE_OPTIONS } from "@/lib/song/song-to-slides"

type SttProvider = "deepgram" | "sherpa"
type MediaImportMode = "reference" | "copy"

interface SettingsState {
  deepgramApiKey: string | null
  geniusApiKey: string | null
  openaiApiKey: string | null
  claudeApiKey: string | null
  audioDeviceId: string | null
  gain: number
  autoMode: boolean
  confidenceThreshold: number
  cooldownMs: number
  onboardingComplete: boolean
  sttProvider: SttProvider
  /**
   * Total silence (ms) the local (Moonshine) transcriber tolerates before it
   * ends an utterance — the "Pause Sensitivity" slider. Lower = snappier but
   * chops mid-sentence pauses; higher = waits through long pauses (slower
   * readers) at the cost of end-of-speech latency. Only affects the local
   * provider; Deepgram does its own server-side endpointing.
   */
  pauseSilenceMs: number
  directAutoDisplay: boolean
  semanticAutoQueue: boolean
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

  setDeepgramApiKey: (key: string | null) => void
  setGeniusApiKey: (key: string | null) => void
  setOpenaiApiKey: (key: string | null) => void
  setClaudeApiKey: (key: string | null) => void
  setAudioDeviceId: (id: string | null) => void
  setGain: (gain: number) => void
  setAutoMode: (auto: boolean) => void
  setConfidenceThreshold: (threshold: number) => void
  setCooldownMs: (ms: number) => void
  setOnboardingComplete: (complete: boolean) => void
  setSttProvider: (provider: SttProvider) => void
  setPauseSilenceMs: (ms: number) => void
  setDirectAutoDisplay: (enabled: boolean) => void
  setSemanticAutoQueue: (enabled: boolean) => void
  setPreventDuplicateScheduleItems: (enabled: boolean) => void
  setMediaImportMode: (mode: MediaImportMode) => void
  setLexiconEnabled: (enabled: boolean) => void
  setSongSlideDefaults: (options: SongSlideOptions) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  deepgramApiKey: null,
  geniusApiKey: null,
  openaiApiKey: null,
  claudeApiKey: null,
  audioDeviceId: null,
  gain: 1.0,
  autoMode: false,
  confidenceThreshold: 0.65,
  cooldownMs: 2500,
  onboardingComplete: false,
  sttProvider: "deepgram",
  pauseSilenceMs: 1400,
  directAutoDisplay: true,
  semanticAutoQueue: false,
  preventDuplicateScheduleItems: true,
  mediaImportMode: "reference",
  lexiconEnabled: false,
  songSlideDefaults: DEFAULT_SONG_SLIDE_OPTIONS,

  setDeepgramApiKey: (deepgramApiKey) => set({ deepgramApiKey }),
  setGeniusApiKey: (geniusApiKey) => set({ geniusApiKey }),
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
  setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
  setAudioDeviceId: (audioDeviceId) => set({ audioDeviceId }),
  setGain: (gain) => set({ gain }),
  setAutoMode: (autoMode) => set({ autoMode }),
  setConfidenceThreshold: (confidenceThreshold) => set({ confidenceThreshold }),
  setCooldownMs: (cooldownMs) => set({ cooldownMs }),
  setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
  setSttProvider: (sttProvider) => set({ sttProvider }),
  setPauseSilenceMs: (pauseSilenceMs) => set({ pauseSilenceMs }),
  setDirectAutoDisplay: (directAutoDisplay) => set({ directAutoDisplay }),
  setSemanticAutoQueue: (semanticAutoQueue) => set({ semanticAutoQueue }),
  setPreventDuplicateScheduleItems: (preventDuplicateScheduleItems) =>
    set({ preventDuplicateScheduleItems }),
  setMediaImportMode: (mediaImportMode) => set({ mediaImportMode }),
  setLexiconEnabled: (lexiconEnabled) => set({ lexiconEnabled }),
  setSongSlideDefaults: (songSlideDefaults) => set({ songSlideDefaults }),
}))

const PERSISTED_KEYS = [
  "deepgramApiKey",
  "geniusApiKey",
  "openaiApiKey",
  "claudeApiKey",
  "audioDeviceId",
  "gain",
  "autoMode",
  "confidenceThreshold",
  "cooldownMs",
  "onboardingComplete",
  "sttProvider",
  "pauseSilenceMs",
  "directAutoDisplay",
  "semanticAutoQueue",
  "preventDuplicateScheduleItems",
  "mediaImportMode",
  "lexiconEnabled",
  "songSlideDefaults",
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
      if (Object.keys(patch).length > 0) {
        useSettingsStore.setState(patch)
      }

      // Sync detection settings to the backend merger on first hydration
      syncDetectionSettings(useSettingsStore.getState())

      // Attach only after successful hydration so as not to overwrite disk with defaults.
      // Debounce writes, so a dragged slider (e.g. gain) coalesces into a single disk write.
      useSettingsStore.subscribe((state, prevState) => {
        const changed = PERSISTED_KEYS.some((k) => state[k] !== prevState[k])
        if (!changed) return

        // Sync detection-related settings to backend immediately
        if (
          state.confidenceThreshold !== prevState.confidenceThreshold ||
          state.cooldownMs !== prevState.cooldownMs
        ) {
          syncDetectionSettings(state)
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
    confidenceThreshold: state.confidenceThreshold,
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
