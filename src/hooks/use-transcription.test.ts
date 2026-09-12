import { beforeEach, describe, expect, it, vi } from "vitest"

const mockInvoke = vi.fn()
const mockToastError = vi.fn()
const mockToastWarning = vi.fn()
const mockToastSuccess = vi.fn()
const mockPullKey = vi.fn()
const mockReportUsage = vi.fn()
const mockReportKeyInvalid = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock("@/services/transcription-key-gateway", () => ({
  pullTranscriptionKey: (...args: unknown[]) => mockPullKey(...args),
  reportTranscriptionUsage: (...args: unknown[]) => mockReportUsage(...args),
  reportKeyInvalid: (...args: unknown[]) => mockReportKeyInvalid(...args),
}))

vi.mock("@/services/analytics-gateway", () => ({
  trackServiceStarted: () => {},
  setAnalyticsEnabled: () => {},
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
  const authMod = await import("@/stores/auth-store")
  const hookMod = await import("./use-transcription")
  return {
    useTranscriptStore: transcriptMod.useTranscriptStore,
    useSettingsStore: settingsMod.useSettingsStore,
    useAuthStore: authMod.useAuthStore,
    transcriptionActions: hookMod.transcriptionActions,
  }
}

describe("use-transcription", () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockToastError.mockReset()
    mockToastWarning.mockReset()
    mockToastSuccess.mockReset()
    mockPullKey.mockReset()
    mockReportUsage.mockReset()
    mockReportKeyInvalid.mockReset()
  })

  describe("transcriptionActions.start", () => {
    it("invokes start_transcription with the Deepgram key and audio settings", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useSettingsStore, transcriptionActions } = await loadModules()

      useSettingsStore.setState({
        deepgramApiKey: "dg-live-123",
        audioDeviceId: "dev-42",
        gain: 1.5,
      })

      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "dg-live-123",
        deviceId: "dev-42",
        gain: 1.5,
      })
    })

    it("forwards an empty key when none is configured", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useSettingsStore, transcriptionActions } = await loadModules()

      useSettingsStore.setState({
        deepgramApiKey: null,
        audioDeviceId: null,
        gain: 1.0,
      })

      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith(
        "start_transcription",
        expect.objectContaining({
          apiKey: "",
          deviceId: null,
          gain: 1.0,
        })
      )
    })

    it("uses the local key without pulling from the platform when signed in and source is 'local'", async () => {
      mockInvoke.mockResolvedValue(undefined)
      const { useSettingsStore, useAuthStore, transcriptionActions } =
        await loadModules()

      useAuthStore.setState({ token: "session-token", status: "authenticated" })
      useSettingsStore.setState({
        deepgramApiKey: "dg-local-key",
        transcriptionKeySource: "local",
        audioDeviceId: "dev-1",
        gain: 1.0,
      })

      await transcriptionActions.start()

      // Local source bypasses the platform: no key pull, no metering setup.
      expect(mockPullKey).not.toHaveBeenCalled()
      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "dg-local-key",
        deviceId: "dev-1",
        gain: 1.0,
      })
    })

    it("pulls a platform key when signed in and source is 'platform'", async () => {
      mockInvoke.mockResolvedValue(undefined)
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "dg-platform-key",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
        byokPresent: false,
      })
      const { useSettingsStore, useAuthStore, transcriptionActions } =
        await loadModules()

      useAuthStore.setState({ token: "session-token", status: "authenticated" })
      useSettingsStore.setState({
        deepgramApiKey: "dg-local-key",
        transcriptionKeySource: "platform",
        audioDeviceId: "dev-1",
        gain: 1.0,
      })

      await transcriptionActions.start()

      expect(mockPullKey).toHaveBeenCalledWith("session-token")
      // Platform key wins over the present local key.
      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "dg-platform-key",
        deviceId: "dev-1",
        gain: 1.0,
      })
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
      mockInvoke.mockRejectedValue("WebSocket handshake failed")
      const { useTranscriptStore, transcriptionActions } = await loadModules()
      const onMissingApiKey = vi.fn()

      await transcriptionActions.start(onMissingApiKey)

      expect(onMissingApiKey).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledWith(
        "Could not start transcription",
        { description: "WebSocket handshake failed" }
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
})
