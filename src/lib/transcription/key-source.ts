/**
 * Which Deepgram key a live session should use (beta-only choice).
 *
 * During beta the operator can pick between the platform-managed key (resolved
 * and metered by LumenBO) and their own key entered in desktop Settings. This
 * maps that preference to the actual source, given whether a local key is
 * present and whether the client is signed in.
 *
 * TEMPORARY: at alpha the desktop Settings key goes away and everything uses the
 * platform key. When that happens, delete this module, the
 * `transcriptionKeySource` setting, and the Settings toggle — no other logic
 * depends on the local branch.
 */

/** The operator's declared preference. */
export type TranscriptionKeySource = "platform" | "local"

export interface KeySourceInput {
  /** The operator's chosen source from Settings. */
  source: TranscriptionKeySource
  /** A non-empty Deepgram key is saved in desktop Settings. */
  hasLocalKey: boolean
  /** The client is signed in (has an account bearer token). */
  hasToken: boolean
}

/**
 * Resolve the effective key source. Rules, in order:
 *   1. No account token (anonymous) → `local` — there's no platform key to pull,
 *      so the local key is the only option (unchanged pre-existing behaviour).
 *   2. Explicitly chose `local` AND a key is actually saved → `local`.
 *   3. Otherwise → `platform`. This deliberately covers "chose local but the
 *      field is empty": fall back to the platform key rather than blocking.
 */
export function resolveKeySource(input: KeySourceInput): TranscriptionKeySource {
  if (!input.hasToken) return "local"
  if (input.source === "local" && input.hasLocalKey) return "local"
  return "platform"
}
