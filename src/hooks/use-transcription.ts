import { useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { useAudioStore } from "@/stores/audio-store"
import { useAuthStore } from "@/stores/auth-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useTranscriptStore } from "@/stores/transcript-store"
import { trackServiceStarted } from "@/services/analytics-gateway"
import {
  pullTranscriptionKey,
  reportKeyInvalid,
  reportTranscriptionUsage,
} from "@/services/transcription-key-gateway"
import { decideTranscriptionStart, describeBlock } from "@/lib/transcription/access"
import type { BlockedCopy } from "@/lib/transcription/access"
import type { TranscriptionMode } from "@/lib/transcription/types"
import {
  sanitizeUsageDelta,
  shouldReportUsage,
} from "@/lib/transcription/usage-meter"
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
   * Transcription runs strictly on platform-managed keys, which require an
   * account, so anonymous users are prompted to sign in rather than shown a
   * generic error toast.
   */
  onSignInRequired?: () => void
  /**
   * Called when the platform blocks transcription for a signed-in user (allowance
   * spent, BYO key rejected, platform key unset). Panels show the reason + a link
   * to the account portal.
   */
  onBlocked?: (copy: BlockedCopy) => void
}

const NOT_RUNNING_ERROR = "Transcription is not running"

/**
 * The mode of the current session, retained at module scope (one live session at
 * a time) so the usage/unauthorized event handlers know how to react. Always a
 * platform-resolved mode while a session is live — usage is metered, and a 401 on
 * a `byok` session means the church's own (portal-configured) key is invalid.
 * `null` between sessions.
 */
let sessionMode: TranscriptionMode | null = null

export const transcriptionActions = {
  async start(
    onSignInRequired?: () => void,
    onBlocked?: (copy: BlockedCopy) => void,
  ): Promise<void> {
    const transcript = useTranscriptStore.getState()
    transcript.setConnectionStatus("connecting")

    const settings = useSettingsStore.getState()
    const token = useAuthStore.getState().token
    sessionMode = null

    // Transcription runs strictly on platform-managed keys, which require an
    // account. Without a token there's no key to pull, so prompt sign-in rather
    // than attempt to start.
    if (!token) {
      transcript.setConnectionStatus("disconnected")
      if (onSignInRequired) onSignInRequired()
      else
        toast.error("Sign in to transcribe", {
          description:
            "Transcription is included with your LumenLive account. Sign in to start.",
        })
      return
    }

    let apiKey: string
    try {
      const resolution = await pullTranscriptionKey(token)
      transcript.setRemainingMinutes(resolution.remainingMinutes)
      const decision = decideTranscriptionStart(resolution)
      if (decision.action === "blocked") {
        transcript.setConnectionStatus("disconnected")
        if (onBlocked) onBlocked(decision.copy)
        else toast.error(decision.copy.title, { description: decision.copy.message })
        return
      }
      apiKey = decision.key
      sessionMode = decision.mode
    } catch {
      // Couldn't reach the backend (offline/refused). There's no local-key
      // fallback anymore — transcription is platform-only — so surface it.
      transcript.setConnectionStatus("error")
      toast.error("Could not start transcription", {
        description:
          "Couldn't reach your LumenLive account. Check your connection and try again.",
      })
      return
    }

    try {
      await invoke("start_transcription", {
        apiKey,
        deviceId: settings.audioDeviceId,
        gain: settings.gain,
      })
      transcript.setTranscribing(true)
    } catch (e) {
      const msg = String(e)
      transcript.setConnectionStatus("error")
      sessionMode = null
      toast.error("Could not start transcription", { description: msg })
    }
  },

  async stop(): Promise<void> {
    const transcript = useTranscriptStore.getState()
    try {
      await invoke("stop_transcription")
    } catch (e) {
      if (String(e) !== NOT_RUNNING_ERROR) {
        toast.error("Could not stop transcription", { description: String(e) })
      }
    }
    // Leave `sessionMode` set until the final `transcription_usage` flush from
    // Rust has a chance to report; it's reset on the next start.
    transcript.setTranscribing(false)
    transcript.setPartial("")
    transcript.setConnectionStatus("disconnected")
  },
}

export function useTranscription(options?: UseTranscriptionOptions) {
  const segments = useTranscriptStore((s) => s.segments)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const connectionStatus = useTranscriptStore((s) => s.connectionStatus)

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

  // The STT service rejected the API key (HTTP 401). Distinct from a generic
  // error: on a BYO session it means the church's own key is bad, so tell the
  // backend (flags it + fires the "key needs attention" email) and prompt a fix.
  useTauriEvent("stt_unauthorized", () => {
    const transcript = useTranscriptStore.getState()
    transcript.setConnectionStatus("error")
    transcript.setTranscribing(false)
    const wasByok = sessionMode === "byok"
    sessionMode = null
    const token = useAuthStore.getState().token
    if (wasByok && token) {
      void reportKeyInvalid(token).catch(() => {})
      const copy = describeBlock("byok_invalid")
      if (options?.onBlocked) options.onBlocked(copy)
      else toast.error(copy.title, { description: copy.message })
    } else {
      toast.error("Transcription key rejected", {
        description: "The transcription service rejected the API key.",
      })
    }
  })

  // Rust meters audio-seconds streamed to the STT provider and emits per-minute
  // deltas. Report them for signed-in, platform-resolved sessions so free/trial
  // allowances are enforced; anonymous BYO sessions (`sessionMode === null`) skip.
  useTauriEvent<TranscriptionUsagePayload>("transcription_usage", (payload) => {
    if (sessionMode === null) return
    const token = useAuthStore.getState().token
    if (!token) return
    const seconds = sanitizeUsageDelta(payload.seconds)
    if (!shouldReportUsage(seconds)) return
    void reportTranscriptionUsage(token, seconds)
      .then((status) => {
        useTranscriptStore.getState().setRemainingMinutes(status.remainingMinutes)
      })
      .catch(() => {})
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

  const onSignInRequired = options?.onSignInRequired
  const onBlocked = options?.onBlocked

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
