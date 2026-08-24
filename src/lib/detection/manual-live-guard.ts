import type { BroadcastSource } from "@/stores/broadcast/types"

/**
 * Live sources the operator deliberately placed. An AI auto-display must not
 * silently clobber these unless the detection is high-trust. `"ai"` and `null`
 * are NOT here: AI may freely update its own auto-display, and nothing is at
 * stake when the output is empty.
 */
const OPERATOR_SOURCES: readonly BroadcastSource[] = [
  "schedule",
  "queue",
  "manual",
]

/**
 * Manual-live guard — decide whether an AI auto-display / voice-nav take may
 * push to the live output (aitrans Phase 4, decision D — "Hybrid").
 *
 * The rule:
 *  - A **high-trust** call (`isLowTrust === false`) always takes. This is the
 *    preacher genuinely moving on — a cleanly-spoken reference or an explicit
 *    voice command — and it may override even operator-placed live, matching the
 *    operator's decision to obey the auto-display toggles for genuine calls.
 *  - A **low-trust** call (`isLowTrust === true`) — a narrative mention (a book
 *    name spoken in prose while Reading Mode tracks a different book) — must NOT
 *    override content the operator deliberately placed. It still stages into the
 *    Program preview and queue for a deliberate send; it just never auto-takes
 *    over operator work.
 *
 * Note: the primary Phase-3 gate already keeps narrative mentions out of the
 * auto-display path entirely, so in practice `isLowTrust` is false at the take
 * sites; this guard is the single-sourced policy and defence-in-depth so a
 * low-trust hit can never clobber operator-placed live even if it slips through.
 */
export function aiMayTakeLive(
  liveSource: BroadcastSource,
  isLowTrust: boolean
): boolean {
  if (!isLowTrust) return true
  return !OPERATOR_SOURCES.includes(liveSource)
}
