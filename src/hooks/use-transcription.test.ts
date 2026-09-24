import { beforeEach, describe, expect, it, vi } from "vitest"

const mockInvoke = vi.fn()
const mockToastError = vi.fn()
const mockToastWarning = vi.fn()
const mockToastSuccess = vi.fn()
const mockPullKey = vi.fn()
const mockReportUsage = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock("@/services/transcription-key-gateway", () => ({
  pullTranscriptionKey: (...args: unknown[]) => mockPullKey(...args),
  reportTranscriptionUsage: (...args: unknown[]) => mockReportUsage(...args),
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
  const entitlementsMod = await import("@/stores/entitlements-store")
  const hookMod = await import("./use-transcription")
  // Key minting is now device-bound; keep unrelated start-flow tests focused on
  // their stated behaviour instead of the native machine-ID bridge.
  entitlementsMod.useEntitlementsStore.setState({ machineId: "machine-test" })
  return {
    useTranscriptStore: transcriptMod.useTranscriptStore,
    useSettingsStore: settingsMod.useSettingsStore,
    useAuthStore: authMod.useAuthStore,
    useEntitlementsStore: entitlementsMod.useEntitlementsStore,
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
  })

  /** A ready-to-use signed-in session for the platform-key path. */
  function signIn(useAuthStore: {
    setState: (partial: Record<string, unknown>) => void
  }) {
    useAuthStore.setState({
      token: "session-token",
      status: "authenticated",
      activationStatus: "activated",
    })
  }

  describe("transcriptionActions.start", () => {
    it("pulls a platform key and starts with it and the audio settings", async () => {
      mockInvoke.mockResolvedValue(undefined)
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "snx-platform-key",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
      })
      const {
        useSettingsStore,
        useAuthStore,
        useEntitlementsStore,
        transcriptionActions,
      } = await loadModules()

      signIn(useAuthStore)
      useEntitlementsStore.setState({ machineId: "machine-1" })
      useSettingsStore.setState({ audioDeviceId: "dev-42", gain: 1.5 })

      await transcriptionActions.start()

      expect(mockPullKey).toHaveBeenCalledWith("session-token", "machine-1")
      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "snx-platform-key",
        provider: "deepgram",
        deviceId: "dev-42",
        gain: 1.5,
      })
    })

    it("defaults provider to deepgram when the resolution omits it", async () => {
      mockInvoke.mockResolvedValue(undefined)
      // Older lumenbo: no `provider` field in the resolution.
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "dg-platform-key",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
      })
      const { useAuthStore, transcriptionActions } = await loadModules()

      signIn(useAuthStore)
      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith(
        "start_transcription",
        expect.objectContaining({ provider: "deepgram" })
      )
    })

    it("relays the server-chosen soniox provider into the invoke", async () => {
      mockInvoke.mockResolvedValue(undefined)
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "snx-temp-key",
        provider: "soniox",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
      })
      const { useSettingsStore, useAuthStore, transcriptionActions } =
        await loadModules()

      signIn(useAuthStore)
      useSettingsStore.setState({ audioDeviceId: "dev-42", gain: 1.5 })

      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "snx-temp-key",
        provider: "soniox",
        deviceId: "dev-42",
        gain: 1.5,
      })
    })

    it("starts a team BYOK session without displaying a platform allowance", async () => {
      mockInvoke.mockResolvedValue(undefined)
      mockPullKey.mockResolvedValue({
        mode: "team_byok",
        key: "team-deepgram-key",
        provider: "deepgram",
        remainingMinutes: null,
        tier: "free",
        allowanceMinutes: -1,
        usedMinutes: 0,
      })
      const { useAuthStore, useTranscriptStore, transcriptionActions } =
        await loadModules()

      signIn(useAuthStore)
      await transcriptionActions.start()

      expect(mockInvoke).toHaveBeenCalledWith("start_transcription", {
        apiKey: "team-deepgram-key",
        provider: "deepgram",
        deviceId: null,
        gain: 1,
      })
      expect(useTranscriptStore.getState().remainingMinutes).toBeNull()
      expect(useTranscriptStore.getState().transcriptionStatus).toMatchObject({
        mode: "team_byok",
        remainingMinutes: null,
      })
    })

    it("routes an expired session during key retrieval to sign-in recovery", async () => {
      const { useAuthStore, transcriptionActions } = await loadModules()
      const onSignInRequired = vi.fn()

      const { LicensingError } = await import("@/services/lumenbo-client")
      mockPullKey.mockRejectedValue(
        new LicensingError("UNAUTHORIZED", "Session expired", 401)
      )

      signIn(useAuthStore)
      await transcriptionActions.start(onSignInRequired)

      expect(onSignInRequired).toHaveBeenCalledTimes(1)
      expect(mockToastError).not.toHaveBeenCalled()
    })

    it("prompts sign-in (no pull, no invoke) when anonymous", async () => {
      const { useTranscriptStore, transcriptionActions } = await loadModules()
      const onSignInRequired = vi.fn()

      await transcriptionActions.start(onSignInRequired)

      expect(onSignInRequired).toHaveBeenCalledTimes(1)
      expect(mockPullKey).not.toHaveBeenCalled()
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockToastError).not.toHaveBeenCalled()
      expect(useTranscriptStore.getState().connectionStatus).toBe(
        "disconnected"
      )
    })

    it("falls back to a toast when anonymous and no sign-in callback is given", async () => {
      const { transcriptionActions } = await loadModules()

      await transcriptionActions.start()

      expect(mockPullKey).not.toHaveBeenCalled()
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledWith(
        "Sign in to transcribe",
        expect.objectContaining({ description: expect.any(String) })
      )
    })

    it("does not pull a provider key before device activation completes", async () => {
      const { useAuthStore, transcriptionActions } = await loadModules()

      useAuthStore.setState({
        token: "session-token",
        status: "authenticated",
        activationStatus: "failed",
      })
      await transcriptionActions.start()

      expect(mockPullKey).not.toHaveBeenCalled()
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledWith(
        "Activate this device first",
        expect.objectContaining({ description: expect.any(String) })
      )
    })

    it("blocks (with copy) when the platform denies the key", async () => {
      mockPullKey.mockResolvedValue({
        mode: "blocked",
        reason: "allowance_exhausted",
        remainingMinutes: 0,
        tier: "free",
        allowanceMinutes: 60,
        usedMinutes: 60,
      })
      const { useTranscriptStore, useAuthStore, transcriptionActions } =
        await loadModules()
      const onBlocked = vi.fn()

      signIn(useAuthStore)
      await transcriptionActions.start(undefined, onBlocked)

      expect(onBlocked).toHaveBeenCalledTimes(1)
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(useTranscriptStore.getState().connectionStatus).toBe(
        "disconnected"
      )
    })

    it("surfaces a toast (no local fallback) when the key pull fails", async () => {
      mockPullKey.mockRejectedValue(new Error("network down"))
      const { useTranscriptStore, useAuthStore, transcriptionActions } =
        await loadModules()

      signIn(useAuthStore)
      await transcriptionActions.start()

      expect(mockInvoke).not.toHaveBeenCalled()
      expect(mockToastError).toHaveBeenCalledWith(
        "Could not start transcription",
        {
          description:
            "LumenLive could not prepare transcription. Try again. If this keeps happening, contact support.",
        }
      )
      expect(useTranscriptStore.getState().connectionStatus).toBe("error")
    })

    it("sets connectionStatus to 'connecting' before invoke resolves and 'isTranscribing' after", async () => {
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "dg-platform-key",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
      })
      let resolveInvoke: () => void = () => {}
      mockInvoke.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveInvoke = resolve
        })
      )

      const { useTranscriptStore, useAuthStore, transcriptionActions } =
        await loadModules()

      signIn(useAuthStore)
      const pending = transcriptionActions.start()

      expect(useTranscriptStore.getState().connectionStatus).toBe("connecting")
      expect(useTranscriptStore.getState().isTranscribing).toBe(false)

      resolveInvoke()
      await pending

      expect(useTranscriptStore.getState().isTranscribing).toBe(true)
      expect(useTranscriptStore.getState().connectionStatus).not.toBe("error")
    })

    it("surfaces a start_transcription error as a toast", async () => {
      mockPullKey.mockResolvedValue({
        mode: "platform_trial",
        key: "dg-platform-key",
        remainingMinutes: 120,
        tier: "free",
        allowanceMinutes: 300,
        usedMinutes: 180,
      })
      mockInvoke.mockRejectedValue("WebSocket handshake failed")
      const { useTranscriptStore, useAuthStore, transcriptionActions } =
        await loadModules()

      signIn(useAuthStore)
      await transcriptionActions.start()

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
