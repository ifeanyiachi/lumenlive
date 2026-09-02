import { v1 } from "./lumenbo-client"
import type {
  TranscriptionResolution,
  TranscriptionStatus,
} from "@/lib/transcription/types"

/**
 * Gateway for the desktop transcription-key contract (portalplan D2-06;
 * `docs/desktop-transcription-contract.md`). The desktop talks to Deepgram
 * directly, but the platform decides which key it may use and meters free/trial
 * minutes. All three endpoints are bearer-authed with the same session token as
 * `/v1/licenses/*`; the raw key must not be persisted beyond the current session.
 */

export type {
  TranscriptionResolution,
  TranscriptionStatus,
} from "@/lib/transcription/types"

/**
 * Pull the key this client may use right now. Call at the start of a session and
 * on rotation/expiry — re-pull rather than caching long-term. Returns either a
 * usable key or a `blocked` state with a reason.
 */
export function pullTranscriptionKey(
  token: string,
): Promise<TranscriptionResolution> {
  return v1<TranscriptionResolution>("/v1/transcription/key", {
    method: "POST",
    token,
    body: {},
  })
}

/**
 * Report consumed transcription seconds as a delta (not a running total). The
 * response is the fresh status, so the caller learns when the allowance is spent.
 */
export function reportTranscriptionUsage(
  token: string,
  seconds: number,
): Promise<TranscriptionStatus> {
  return v1<TranscriptionStatus>("/v1/transcription/usage", {
    method: "POST",
    token,
    body: { seconds },
  })
}

/**
 * Report that the STT service rejected the church's BYO key, so the backend can
 * flag it (the portal then prompts a fix) and fire the "key needs attention" email.
 */
export function reportKeyInvalid(token: string): Promise<{ ok: boolean }> {
  return v1<{ ok: boolean }>("/v1/transcription/key-invalid", {
    method: "POST",
    token,
    body: {},
  })
}
