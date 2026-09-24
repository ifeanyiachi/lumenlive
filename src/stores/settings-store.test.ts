import { beforeEach, describe, expect, it, vi } from "vitest"

const mockGet = vi.fn()
const mockSet = vi.fn()
const mockSave = vi.fn()
const mockLoad = vi.fn()

vi.mock("@tauri-apps/plugin-store", () => ({
  load: (...args: unknown[]) => mockLoad(...args),
}))

// Isolate the store from real i18next: `hydrateSettings` awaits
// `changeLanguage`, which initializes i18next and dynamically imports locale
// catalogs. Under fake timers that async work never settles (the test awaits
// hydration before advancing timers), so stub the language switch to resolve
// immediately while keeping the pure `resolveSupportedLocale` real — the
// "OS language" test relies on its actual mapping.
vi.mock("@/lib/i18n/config", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/i18n/config")>(
      "@/lib/i18n/config"
    )
  return { ...actual, changeLanguage: vi.fn().mockResolvedValue(undefined) }
})

async function flushSave(): Promise<void> {
  // Advance past the debounce window, then let the chained
  // pendingSave promise resolve.
  await vi.advanceTimersByTimeAsync(300)
  await Promise.resolve()
  await Promise.resolve()
}

describe("settings store", () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    mockGet.mockReset()
    mockSet.mockReset()
    mockSave.mockReset()
    mockLoad.mockReset()
    mockLoad.mockResolvedValue({
      get: mockGet,
      set: mockSet,
      save: mockSave,
    })
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("hydrate merges persisted values over defaults", async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === "gain") return 2.5
      if (key === "geniusApiKey") return "genius-key"
      return null
    })

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()

    const state = useSettingsStore.getState()
    expect(state.gain).toBe(2.5)
    expect(state.geniusApiKey).toBe("genius-key")
    // Defaults remain for keys with null. The default confidence threshold is
    // 0.65 to match the backend merger's DEFAULT_AUTO_QUEUE_THRESHOLD (the
    // frontend value is forwarded straight to set_auto_queue_threshold).
    expect(state.confidenceThreshold).toBe(0.65)
  })

  it("hydrate with no persisted values falls back to defaults", async () => {
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    const before = useSettingsStore.getState()
    await hydrateSettings()
    const after = useSettingsStore.getState()

    expect(after.gain).toBe(before.gain)
    expect(after.directVerseDestination).toBe(before.directVerseDestination)
    expect(after.telemetryEnabled).toBe(true)
  })

  it("migrates the former direct-to-live toggle to its matching destination", async () => {
    mockGet.mockImplementation(async (key: string) =>
      key === "directVerseToLive" ? true : null
    )

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()

    expect(useSettingsStore.getState().directVerseDestination).toBe("live")
    expect(mockSet).toHaveBeenCalledWith("directVerseDestination", "live")
  })

  it("seeds and persists a supported OS language on first run", async () => {
    vi.stubGlobal("navigator", { language: "fr-FR" })
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()

    expect(useSettingsStore.getState().uiLanguage).toBe("fr")
    expect(mockSet).toHaveBeenCalledWith("uiLanguage", "fr")
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it("lexicon is installed-but-disabled by default and persists when toggled", async () => {
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()
    mockSet.mockClear()
    mockSave.mockClear()

    // Bundled with KJV but off until the user opts in.
    expect(useSettingsStore.getState().lexiconEnabled).toBe(false)

    useSettingsStore.getState().setLexiconEnabled(true)
    await flushSave()

    expect(mockSet).toHaveBeenCalledWith("lexiconEnabled", true)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it("a setter call after hydration writes the full snapshot to disk", async () => {
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()
    mockSet.mockClear()
    mockSave.mockClear()

    useSettingsStore.getState().setGain(1.75)

    // Debounced — nothing written yet.
    expect(mockSet).not.toHaveBeenCalled()
    expect(mockSave).not.toHaveBeenCalled()

    await flushSave()

    expect(mockSet).toHaveBeenCalledWith("gain", 1.75)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it("rapid setter calls coalesce into a single save", async () => {
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()
    mockSet.mockClear()
    mockSave.mockClear()

    const { setGain } = useSettingsStore.getState()
    setGain(1.1)
    setGain(1.2)
    setGain(1.3)

    await flushSave()

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSet).toHaveBeenCalledWith("gain", 1.3)
  })

  it("concurrent hydrate calls attach only one subscription", async () => {
    mockGet.mockResolvedValue(null)

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    // Kick off two concurrent hydrations — a second caller must not
    // attach a duplicate subscription that would double every write.
    await Promise.all([hydrateSettings(), hydrateSettings()])
    mockSet.mockClear()
    mockSave.mockClear()

    useSettingsStore.getState().setGain(1.5)
    await flushSave()

    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it("hydrate handles load rejection gracefully", async () => {
    mockLoad.mockRejectedValue(new Error("store not available"))
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await expect(hydrateSettings()).resolves.toBeUndefined()

    // Defaults preserved
    expect(useSettingsStore.getState().gain).toBe(1.0)
    expect(warnSpy).toHaveBeenCalledWith(
      "[settings] Failed to load persisted state, using defaults"
    )
    warnSpy.mockRestore()
  })

  it("persist handles save rejection gracefully", async () => {
    mockGet.mockResolvedValue(null)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const { hydrateSettings, useSettingsStore } =
      await import("./settings-store")
    await hydrateSettings()

    mockSet.mockClear()
    mockSave.mockReset()
    mockSave.mockRejectedValue(new Error("disk error"))

    // Flip to a value that actually changes (default is preview), or the
    // subscribe listener sees no change and never attempts a save.
    useSettingsStore.getState().setDirectVerseDestination("live")
    await flushSave()

    expect(warnSpy).toHaveBeenCalledWith(
      "[settings] Failed to persist settings"
    )
    warnSpy.mockRestore()
  })
})
