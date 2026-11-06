import {
  completeAuthentication,
  type SignInActivationResult,
} from "@/stores/licensing-actions"
import type { SignInResult } from "@/services/lumenbo-client"
import { openAccountMenu } from "@/lib/account-menu"

import {
  getDesktopAuthSnapshot,
  subscribeDesktopAuth,
  startDesktopLogin,
  type DesktopAuthSnapshot,
} from "./desktop-auth-service"

type ResumeAction = () => void

let pendingResume: ResumeAction | null = null

subscribeDesktopAuth(() => {
  const snapshot = getDesktopAuthSnapshot()
  if (
    snapshot.status === "cancelled" ||
    snapshot.status === "timed-out" ||
    snapshot.status === "failed"
  ) {
    pendingResume = null
  }
})

/** Start the shared browser sign-in flow used by Account and gated features. */
export async function startBrowserSignIn(options?: {
  pendingAction?: string | null
  onActivated?: ResumeAction
}): Promise<DesktopAuthSnapshot> {
  pendingResume = options?.onActivated ?? null
  try {
    const snapshot = await startDesktopLogin(options?.pendingAction)
    // Gated prompts and the transcription dialog may start the flow while the
    // Account popover is closed; keep the pending/cancelled/timeout state visible.
    openAccountMenu()
    return snapshot
  } catch (error) {
    pendingResume = null
    throw error
  }
}

/** Finish the common authenticated-user pipeline after a browser exchange. */
export async function completeBrowserAuthentication(
  result: SignInResult
): Promise<SignInActivationResult> {
  return completeAuthentication(result)
}

/** Resume a feature only after team activation and local license verification. */
export function resumePendingBrowserAction(): void {
  const resume = pendingResume
  pendingResume = null
  resume?.()
}

/** Discard a deferred feature action when browser sign-in is cancelled or fails. */
export function clearPendingBrowserAction(): void {
  pendingResume = null
}

export { getDesktopAuthSnapshot }
