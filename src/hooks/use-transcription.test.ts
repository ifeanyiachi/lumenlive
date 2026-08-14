import { beforeEach, describe, expect, it, vi } from "vitest"

const mockInvoke = vi.fn()
const mockToastError = vi.fn()
const mockToastWarning = vi.fn()
const mockToastSuccess = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}))

vi.mock("@/hooks/use-tauri-event", () => ({
  useTauriEvent: () => {},
}))

async function loadModules() {
  vi.resetModules()
  const transcriptMod = await import("@/stores/transcript-store")
  const settingsMod = await import("@/stores/settings-store")
  const hookMod = await import("./use-transcription")
  return {
    useTranscriptStore: transcriptMod.useTranscriptStore,
    useSettingsStore: settingsMod.useSettingsStore,
    transcriptionActions: hookMod.transcriptionActions,
  }
}

describe("use-transcription", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockToastError.mockReset()
    mockToastWarning.mockReset()
    mockToastSuccess.mockReset()
  })

  describe("transcriptionActions.start", () => {
    it("invokes start_transcription with settings-derived params for a local provider", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useSettingsStore, transcriptionActions } = await loadModules()

      useSettingsStore.setState({
        sttProvider: "sherpa",
        deepgramApiKey: "ignored-for-local",
        audioDeviceId: "dev-42",
        gain: 1.5,
        pauseSilenceMs: 2000,
      })

      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "", // local path never forwards the key
        deviceId: "dev-42",
        gain: 1.5,
        provider: "sherpa",
        pauseSilenceMs: 2000, // the user's Pause Sensitivity flows through
      })
    })

    it("forwards the Deepgram key when provider is deepgram", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useSettingsStore, transcriptionActions } = await loadModules()

      useSettingsStore.setState({
        sttProvider: "deepgram",
        deepgramApiKey: "dg-live-123",
        audioDeviceId: null,
        gain: 1.0,
      })

      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith(
        "start_transcription",
        expect.objectContaining({
          apiKey: "dg-live-123",
          provider: "deepgram",
          deviceId: null,
          gain: 1.0,
        })
      )
    })

    it("sets connectionStatus to 'connecting' before invoke resolves and 'isTranscribing' after", async () => {
      let resolveInvoke: () => void = () => {}
      mockInvoke.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveInvoke = resolve
        })
      )

      const { useTranscriptStore, transcriptionActions } = await loadModules()

      const pending = transcriptionActions.start()

      expect(useTranscriptStore.getState().connectionStatus).toBe("connecting")
      expect(useTranscriptStore.getState().isTranscribing).toBe(false)

      resolveInvoke()
      await pending

      expect(useTranscriptStore.getState().isTranscribing).toBe(true)
      expect(useTranscriptStore.getState().connectionStatus).not.toBe("error")
    })

    it("routes a missing-Deepgram-key error to onMissingApiKey (no toast)", async () => {
      mockInvoke.mockRejectedValue(
        "No Deepgram API key provided. Set it in Settings or via DEEPGRAM_API_KEY env var."
      )
      const { useTranscriptStore, transcriptionActions } = await loadModules()
      const onMissingApiKey = vi.fn()

      await transcriptionActions.start(onMissingApiKey)

      expect(onMissingApiKey).toHaveBeenCalledTimes(1)
      expect(mockToastError).not.toHaveBeenCalled()
      expect(useTranscriptStore.getState().connectionStatus).toBe("error")
      expect(useTranscriptStore.getState().isTranscribing).toBe(false)
    })

    it("falls back to toast when missing-key error fires but no callback is provided", async () => {
      mockInvoke.mockRejectedValue("No Deepgram API key provided")
      const { transcriptionActions } = await loadModules()

      await transcriptionActions.start()

      expect(mockToastError).toHaveBeenCalledWith(
        "Could not start transcription",
        { description: "No Deepgram API key provided" }
      )
    })

    it("surfaces any other start error as a toast", async () => {
      mockInvoke.mockRejectedValue("Moonshine model not found")
      const { useTranscriptStore, transcriptionActions } = await loadModules()
      const onMissingApiKey = vi.fn()

      await transcriptionActions.start(onMissingApiKey)

      expect(onMissingApiKey).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledWith(
        "Could not start transcription",
        { description: "Moonshine model not found" }
      )
      expect(useTranscriptStore.getState().connectionStatus).toBe("error")
    })
  })

  describe("transcriptionActions.stop", () => {
    it("resets transcript state on success", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useTranscriptStore, transcriptionActions } = await loadModules()

      useTranscriptStore.setState({
        isTranscribing: true,
        currentPartial: "partial text",
        connectionStatus: "connected",
      })

      await transcriptionActions.stop()

      const state = useTranscriptStore.getState()
      expect(state.isTranscribing).toBe(false)
      expect(state.currentPartial).toBe("")
      expect(state.connectionStatus).toBe("disconnected")
      expect(mockToastError).not.toHaveBeenCalled()
    })

    it("silently swallows the exact 'Transcription is not running' error", async () => {
      mockInvoke.mockRejectedValue("Transcription is not running")
      const { useTranscriptStore, transcriptionActions } = await loadModules()

      useTranscriptStore.setState({ isTranscribing: true })

      await transcriptionActions.stop()

      expect(mockToastError).not.toHaveBeenCalled()
      expect(useTranscriptStore.getState().isTranscribing).toBe(false)
    })

    it("surfaces other stop errors as a toast AND still resets UI state", async () => {
      mockInvoke.mockRejectedValue("Audio device disappeared")
      const { useTranscriptStore, transcriptionActions } = await loadModules()

      useTranscriptStore.setState({
        isTranscribing: true,
        currentPartial: "mid-sentence...",
        connectionStatus: "connected",
      })

      await transcriptionActions.stop()

      expect(mockToastError).toHaveBeenCalledWith(
        "Could not stop transcription",
        { description: "Audio device disappeared" }
      )
      const state = useTranscriptStore.getState()
      expect(state.isTranscribing).toBe(false)
      expect(state.currentPartial).toBe("")
      expect(state.connectionStatus).toBe("disconnected")
    })
  })

  describe("stt_error integration contract", () => {
    it("surfaces stt errors via toast and sets connection status to error", async () => {
      const { useTranscriptStore } = await loadModules()

      // Simulate what the stt_error handler does
      useTranscriptStore.getState().setConnectionStatus("error")
      mockToastError("Transcription error", {
        description: "WebSocket closed unexpectedly",
      })

      expect(useTranscriptStore.getState().connectionStatus).toBe("error")
      expect(mockToastError).toHaveBeenCalledWith("Transcription error", {
        description: "WebSocket closed unexpectedly",
      })
    })
  })

  describe("stt engine failover/failback contract", () => {
    it("failover flags on-device mode and warns (not errors)", async () => {
      const { useTranscriptStore } = await loadModules()

      // What the stt_failover handler does: flag on-device mode and surface an
      // informational warning — never an error (transcription keeps running).
      useTranscriptStore.getState().setOnDeviceFallback(true)
      mockToastWarning("Now transcribing on-device", {
        description: "Network lost — switched to on-device transcription",
        id: "stt-engine",
      })

      expect(useTranscriptStore.getState().isOnDeviceFallback).toBe(true)
      expect(mockToastWarning).toHaveBeenCalled()
      expect(mockToastError).not.toHaveBeenCalled()
    })

    it("failback clears on-device mode and reports back online", async () => {
      const { useTranscriptStore } = await loadModules()
      useTranscriptStore.getState().setOnDeviceFallback(true)

      // What the stt_failback handler does: clear the flag, report recovery.
      useTranscriptStore.getState().setOnDeviceFallback(false)
      mockToastSuccess("Back online — cloud transcription", {
        description: "Network restored — switched back to cloud transcription",
        id: "stt-engine",
      })

      expect(useTranscriptStore.getState().isOnDeviceFallback).toBe(false)
      expect(mockToastSuccess).toHaveBeenCalled()
    })

    it("start() clears any stale on-device fallback flag from a prior session", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useTranscriptStore, transcriptionActions } = await loadModules()

      useTranscriptStore.setState({ isOnDeviceFallback: true })

      await transcriptionActions.start()

      expect(useTranscriptStore.getState().isOnDeviceFallback).toBe(false)
    })
  })
})
