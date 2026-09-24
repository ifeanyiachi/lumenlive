/**
 * Pure routing for the transcription-key decision (portalplan D2-06).
 *
 * Given the platform's key resolution, decide whether the desktop may start
 * transcription (and with which key) or must block and prompt the operator. No
 * I/O and no React — the gateway pulls the resolution, this maps it to an action,
 * and the hook acts on it. Colocated tests cover every mode/reason.
 */

import type { BlockedReason, TranscriptionResolution } from "./types"

/** Human-readable copy for a blocked state, shown in the prompt dialog. */
export interface BlockedCopy {
  title: string
  message: string
}

/** The desktop's next move after pulling a key. */
export type StartDecision =
  | {
      action: "start"
      key: string
      mode: Exclude<TranscriptionResolution["mode"], "blocked">
    }
  | { action: "blocked"; reason?: BlockedReason; copy: BlockedCopy }

const GENERIC_BLOCK: BlockedCopy = {
  title: "Transcription unavailable",
  message: "Transcription can't start right now. Check your account.",
}

/** Map a blocked reason to operator-facing copy. */
export function describeBlock(reason?: BlockedReason): BlockedCopy {
  switch (reason) {
    case "allowance_exhausted":
      return {
        title: "Transcription minutes used up",
        message:
          "You've used your free transcription minutes. Upgrade in the account portal to keep transcribing.",
      }
    case "no_subscription":
      return {
        title: "Upgrade your account for continued use",
        message: "Upgrade your account in the portal to continue transcribing.",
      }
    case "platform_key_unset":
      return {
        title: "Transcription not configured",
        message:
          "The platform transcription service isn't set up yet. Please contact support.",
      }
    case "transcription_not_included":
      return {
        title: "Transcription isn't included",
        message: "Upgrade your account in the portal to continue transcribing.",
      }
    case "team_key_unset":
      return {
        title: "Team transcription not configured",
        message:
          "This team's transcription key isn't configured yet. Please contact a team administrator.",
      }
    case "platform_disabled":
      return {
        title: "Platform transcription unavailable",
        message:
          "Platform transcription is disabled for this team. Configure a team key or contact support.",
      }
    default:
      return GENERIC_BLOCK
  }
}

/**
 * Decide whether to start transcription from a pulled resolution. A `blocked`
 * mode — or a non-blocked mode that somehow arrived without a key (defensive) —
 * yields a `blocked` decision with copy; otherwise `start` with the key to use.
 */
export function decideTranscriptionStart(
  resolution: TranscriptionResolution
): StartDecision {
  if (resolution.mode === "blocked") {
    return {
      action: "blocked",
      reason: resolution.reason,
      copy: describeBlock(resolution.reason),
    }
  }
  if (!resolution.key) {
    return { action: "blocked", copy: GENERIC_BLOCK }
  }
  return { action: "start", key: resolution.key, mode: resolution.mode }
}

/**
 * Whether this session's minutes are metered against a finite allowance — i.e.
 * usage reporting actually matters. Paid/team-key paths report `null` remaining.
 */
export function isMetered(resolution: {
  remainingMinutes: number | null
}): boolean {
  return resolution.remainingMinutes !== null
}
