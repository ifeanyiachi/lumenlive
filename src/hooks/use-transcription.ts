import { useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { useAudioStore } from "@/stores/audio-store"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import { useTranscriptStore } from "@/stores/transcript-store"
import { trackServiceStarted } from "@/services/analytics-gateway"
import {
  pullTranscriptionKey,
  reportTranscriptionUsage,
} from "@/services/transcription-key-gateway"
import { decideTranscriptionStart } from "@/lib/transcription/access"
import { describeTranscriptionStartError } from "@/lib/transcription/start-error"
import type { BlockedCopy } from "@/lib/transcription/access"
import type {
  SttProviderId,
} from "@/lib/transcription/types"
import {
  sanitizeUsageDelta,
  shouldReportUsage,
} from "@/lib/transcription/usage-meter"
import { LicensingError } from "@/services/lumenbo-client"
import {
  beginTranscriptionSession,
  clearTranscriptionSession,
  getActiveTranscriptionSession,
  stopAndClearTranscription,
} from "@/services/transcription-session"
import { useTauriEvent } from "./use-tauri-event"

interface TranscriptPartialPayload {
  text: string
  is_final: boolean
  confidence: number
}

interface TranscriptionUsagePayload {
  seconds: number
}

interface UseTranscriptionOptions {
  /**
   * Called when transcription can't start because the user isn't signed in.
   * Server-authorized transcription keys require an account, so anonymous
   * users are prompted to sign in rather than shown a generic error toast.
   */
  onSignInRequired?: () => void
  /**
   * Called when the platform blocks transcription for a signed-in user (allowance
   * spent, platform key unset). Panels show the reason + a link to the account
   * portal.
   */
  onBlocked?: (copy: BlockedCopy) => void
}

const NOT_RUNNING_ERROR = "Transcription is not running"
let providerKeyRetryAttempted = false

interface StartOptions {
  onSignInRequired?: () => void
  onBlocked?: (copy: BlockedCopy) => void
  retryingProviderKey: boolean
}

type StartResult = "started" | "failed" | "cancelled"

// All UI and keyboard entry points share this controller. The latest requested
// state wins while one native or server operation is in flight, so rapid
// toggles cannot mint several keys or race `start_transcription` against
// `stop_transcription`.
let desiredRunning = false
let pendingStartOptions: StartOptions | null = null
let lifecyclePromise: Promise<void> | null = null

function isUnauthorized(error: unknown): boolean {
  return error instanceof LicensingError && error.code === "UNAUTHORIZED"
}

async function startTranscriptionOnce(
  options: StartOptions
): Promise<StartResult> {
  if (!desiredRunning) return "cancelled"

  if (!options.retryingProviderKey) providerKeyRetryAttempted = false
  const transcript = useTranscriptStore.getState()
  transcript.setConnectionStatus("connecting")

  const settings = useSettingsStore.getState()
  const auth = useAuthStore.getState()
  const token = auth.token

  // Without a bearer token there is no server-authorized key to pull, so
  // prompt sign-in rather than attempt to start.
  if (!token) {
    transcript.setConnectionStatus("disconnected")
    if (options.onSignInRequired) options.onSignInRequired()
    else
      toast.error("Sign in to transcribe", {
        description:
          "Transcription is included with your LumenLive account. Sign in to start.",
      })
    return "failed"
  }

  // A bearer session identifies the operator, but it is not enough to mint
  // a provider key. Device activation and team selection must have completed
  // first; the server remains authoritative for the resulting resolution.
  if (auth.activationStatus !== "activated") {
    transcript.setConnectionStatus("disconnected")
    if (auth.activationErrorCode === "UNAUTHORIZED") {
      options.onSignInRequired?.()
      if (!options.onSignInRequired) {
        toast.error("Sign-in expired", {
          description:
            "Your LumenLive session expired. Sign in again to continue transcribing.",
        })
      }
    } else {
      toast.error("Activate this device first", {
        description:
          "Choose a team and finish device activation from the Account menu before transcribing.",
      })
    }
    return "failed"
  }

  let apiKey: string
  // Server-authoritative backend choice; lumenbo names the provider the minted
  // key targets. Absent on older responses → default to Deepgram.
  let provider: SttProviderId = "deepgram"
  try {
    // The server binds each temporary key to an already-activated desktop.
    // This is server-side attribution, not a client-side entitlement check.
    const machineId = await useEntitlementsStore.getState().ensureMachineId()
    const resolution = await pullTranscriptionKey(token, machineId)

    // A stop requested while the key was being prepared cancels this start.
    // Do not bind the session or launch native capture for an obsolete intent.
    if (!desiredRunning) {
      transcript.setConnectionStatus("disconnected")
      return "cancelled"
    }

    transcript.setRemainingMinutes(resolution.remainingMinutes)
    transcript.setTranscriptionStatus({
      mode: resolution.mode,
      reason: resolution.reason,
      tier: resolution.tier,
      allowanceMinutes: resolution.allowanceMinutes,
      usedMinutes: resolution.usedMinutes,
      remainingMinutes: resolution.remainingMinutes,
    })
    const decision = decideTranscriptionStart(resolution)
    if (decision.action === "blocked") {
      transcript.setConnectionStatus("disconnected")
      if (options.onBlocked) options.onBlocked(decision.copy)
      else
        toast.error(decision.copy.title, {
          description: decision.copy.message,
        })
      return "failed"
    }
    apiKey = decision.key
    provider = resolution.provider ?? "deepgram"
    // Replace the prior session binding only once a fresh server resolution
    // is ready, so a final usage delta from a just-stopped session is not
    // lost during key rotation/restart.
    clearTranscriptionSession()
    beginTranscriptionSession(decision.mode, token)
  } catch (error) {
    // A stop may arrive while the server request is in flight. In that case
    // the request's failure is no longer actionable and should stay silent.
    transcript.setConnectionStatus("error")
    if (!desiredRunning) {
      transcript.setConnectionStatus("disconnected")
      clearTranscriptionSession()
      return "cancelled"
    }

    // Key retrieval can fail because of an expired session, a backend response,
    // or the network. Keep those cases distinct for the operator.
    if (isUnauthorized(error)) {
      options.onSignInRequired?.()
      if (!options.onSignInRequired) {
        toast.error("Sign-in expired", {
          description:
            "Your LumenLive session expired. Sign in again to continue transcribing.",
        })
      }
    } else {
      toast.error("Could not start transcription", {
        description: describeTranscriptionStartError(error),
      })
    }
    return "failed"
  }

  try {
    await invoke("start_transcription", {
      apiKey,
      provider,
      deviceId: settings.audioDeviceId,
      gain: settings.gain,
    })
    transcript.setTranscribing(true)
    return "started"
  } catch (e) {
    const msg = String(e)
    transcript.setConnectionStatus("error")
    clearTranscriptionSession()
    if (desiredRunning) {
      toast.error("Could not start transcription", { description: msg })
    } else {
      transcript.setConnectionStatus("disconnected")
    }
    return "failed"
  }
}

async function stopTranscriptionOnce(): Promise<void> {
  const transcript = useTranscriptStore.getState()
  try {
    await invoke("stop_transcription")
  } catch (e) {
    if (String(e) !== NOT_RUNNING_ERROR) {
      toast.error("Could not stop transcription", { description: String(e) })
    }
  }
  // Keep the session binding until the final `transcription_usage` flush from
  // Rust has a chance to report. Account/team changes use
  // stopAndClearTranscription, which removes it before changing identity.
  transcript.setTranscribing(false)
  transcript.setPartial("")
  transcript.setConnectionStatus("disconnected")
}

async function reconcileTranscriptionLifecycle(): Promise<void> {
  while (true) {
    const target = desiredRunning
    const transcript = useTranscriptStore.getState()

    if (target) {
      if (transcript.isTranscribing) return
      const result = await startTranscriptionOnce(
        pendingStartOptions ?? {
          retryingProviderKey: false,
        }
      )
      if (result === "failed" && desiredRunning === target) return
    } else {
      if (
        !transcript.isTranscribing &&
        transcript.connectionStatus !== "connecting"
      ) {
        return
      }
      await stopTranscriptionOnce()
    }

    // Re-read the desired state after each completed operation. If the user
    // toggled during the operation, the loop performs only the final needed
    // transition instead of replaying every intermediate click.
    if (desiredRunning === target) {
      const current = useTranscriptStore.getState()
      if (target === current.isTranscribing) return
    }
  }
}

function requestTranscriptionState(
  running: boolean,
  options?: StartOptions
): Promise<void> {
  desiredRunning = running
  if (options) pendingStartOptions = options

  if (lifecyclePromise) return lifecyclePromise

  const task = reconcileTranscriptionLifecycle().catch((error) => {
    // The individual start/stop operations surface expected failures. This is
    // only a last-resort guard so a lifecycle bug cannot leave the controller
    // permanently locked or create an unhandled rejection.
    console.error("[transcription] lifecycle reconciliation failed", error)
  })
  lifecyclePromise = task
  void task.then(() => {
    if (lifecyclePromise === task) lifecyclePromise = null
  })
  return task
}

export const transcriptionActions = {
  async start(
    onSignInRequired?: () => void,
    onBlocked?: (copy: BlockedCopy) => void,
    retryingProviderKey = false
  ): Promise<void> {
    return requestTranscriptionState(true, {
      onSignInRequired,
      onBlocked,
      retryingProviderKey,
    })
  },

  async stop(): Promise<void> {
    return requestTranscriptionState(false)
  },
}

export function useTranscription(options?: UseTranscriptionOptions) {
  const segments = useTranscriptStore((s) => s.segments)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const connectionStatus = useTranscriptStore((s) => s.connectionStatus)
  const onSignInRequired = options?.onSignInRequired
  const onBlocked = options?.onBlocked

  // STT lifecycle events
  useTauriEvent("stt_connected", () => {
    useTranscriptStore.getState().setConnectionStatus("connected")
  })
  useTauriEvent("stt_disconnected", () => {
    useTranscriptStore.getState().setConnectionStatus("disconnected")
  })
  useTauriEvent<string>("stt_error", (msg) => {
    useTranscriptStore.getState().setConnectionStatus("error")
    toast.error("Transcription error", { description: msg })
  })

  // The STT service rejected the API key (HTTP 401). The key is server-issued
  // and short-lived, so retry once with a freshly pulled resolution. A second
  // rejection is surfaced instead of creating an automatic retry loop.
  useTauriEvent("stt_unauthorized", () => {
    const transcript = useTranscriptStore.getState()
    transcript.setConnectionStatus("error")
    transcript.setTranscribing(false)
    clearTranscriptionSession()
    if (!providerKeyRetryAttempted) {
      providerKeyRetryAttempted = true
      void transcriptionActions.start(
        onSignInRequired,
        onBlocked,
        true
      )
      return
    }
    providerKeyRetryAttempted = false
    toast.error("Transcription key rejected", {
      description:
        "The transcription service rejected the refreshed key. Try again or contact support.",
    })
  })

  // Rust reports audio-seconds as UI telemetry only. Soniox usage logs, bound to
  // the server-issued temporary key, are the authoritative trial meter.
  useTauriEvent<TranscriptionUsagePayload>("transcription_usage", (payload) => {
    const session = getActiveTranscriptionSession()
    if (!session) return
    const seconds = sanitizeUsageDelta(payload.seconds)
    if (!shouldReportUsage(seconds)) return
    void useEntitlementsStore
      .getState()
      .ensureMachineId()
      .then((machineId) =>
        reportTranscriptionUsage(session.token, machineId, seconds)
      )
      .then((status) => {
        // A late response from the previous team/session must never overwrite
        // the current account's usage snapshot.
        const current = getActiveTranscriptionSession()
        if (current !== session) return
        const transcript = useTranscriptStore.getState()
        transcript.setRemainingMinutes(status.remainingMinutes)
        transcript.setTranscriptionStatus(status)
      })
      .catch((error) => {
        if (!isUnauthorized(error)) return
        // Stop native capture before offering a new browser login. This also
        // releases the current provider instance and its in-memory key.
        void stopAndClearTranscription().then(() => {
          if (onSignInRequired) onSignInRequired()
          else {
            toast.error("Sign-in expired", {
              description:
                "Your LumenLive session expired. Sign in again to continue transcribing.",
            })
          }
        })
      })
  })

  // Audio source lifecycle: when the OS device disappears (mic unplugged,
  // headset disconnects, app loses access) the watchdog in the Rust fanout
  // thread emits `audio_source_lost`, then `audio_source_recovered` once it
  // sees the device return. The STT provider stays alive across the gap.
  useTauriEvent("audio_source_lost", () => {
    useAudioStore.getState().setSourceLost(true)
    toast.warning("Audio source disconnected", {
      description: "Waiting for the device to come back…",
      id: "audio-source-status",
    })
  })
  useTauriEvent("audio_source_recovered", () => {
    useAudioStore.getState().setSourceLost(false)
    toast.success("Audio source reconnected", {
      id: "audio-source-status",
    })
  })

  useTauriEvent<TranscriptPartialPayload>("transcript_partial", (payload) => {
    useTranscriptStore.getState().setPartial(payload.text)
  })

  useTauriEvent<TranscriptPartialPayload>("transcript_final", (payload) => {
    useTranscriptStore.getState().addSegment({
      id: crypto.randomUUID(),
      text: payload.text,
      is_final: true,
      confidence: payload.confidence,
      words: [],
      timestamp: Date.now(),
    })
  })

  // A user-initiated start of the live session.
  const startTranscription = useCallback(() => {
    trackServiceStarted()
    return transcriptionActions.start(onSignInRequired, onBlocked)
  }, [onSignInRequired, onBlocked])

  return {
    segments,
    isTranscribing,
    connectionStatus,
    startTranscription,
    stopTranscription: transcriptionActions.stop,
  }
}
