import type { BroadcastOutput } from "@/types"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"

/**
 * Pure selectors and transforms over the list of broadcast outputs.
 *
 * These hold no state and perform no I/O — they are the domain rules for
 * "given these outputs, which one / which theme applies", extracted out of the
 * store so they can be unit-tested in isolation and reused without pulling in
 * zustand.
 */

/** Find an output by id, or `undefined` when none matches. */
export function findOutput(
  outputs: BroadcastOutput[],
  outputId: string
): BroadcastOutput | undefined {
  return outputs.find((o) => o.id === outputId)
}

/**
 * Resolve the theme id that should drive `outputId`.
 *
 * Falls back to the first output's theme, then to the first built-in theme,
 * mirroring the historical store behaviour so no output is ever left themeless.
 */
export function resolveThemeId(
  outputs: BroadcastOutput[],
  outputId: string
): string {
  const output = findOutput(outputs, outputId)
  return output?.themeId ?? outputs[0]?.themeId ?? BUILTIN_THEMES[0].id
}

/**
 * Follow an output's `mirror` routing to the output whose theme + content
 * routing should actually drive it.
 *
 * A `mirror` output renders as a clone of its `sourceOutputId`: it borrows that
 * source's theme and layer filter. (The live program content — verse/slide/media
 * — is already shared by every output, so mirroring only needs to inherit the
 * *presentation*.) Sources may chain (A mirrors B mirrors C); this walks to the
 * first non-mirror output.
 *
 * Every failure mode falls back to the last valid output reached — effectively
 * "be independent: use your own theme, no filter" — instead of looping forever
 * or dereferencing a missing output:
 *  - a `sourceOutputId` matching no output (dangling source),
 *  - a self-reference (A mirrors A),
 *  - a cycle (A → B → A), detected via the visited set.
 *
 * Returns `undefined` only when `outputId` itself matches no output.
 */
export function resolveEffectiveOutput(
  outputs: BroadcastOutput[],
  outputId: string
): BroadcastOutput | undefined {
  let current = findOutput(outputs, outputId)
  if (!current) return undefined
  const visited = new Set<string>([current.id])
  while (current.contentSource.type === "mirror") {
    const next = findOutput(outputs, current.contentSource.sourceOutputId)
    if (!next || visited.has(next.id)) break
    visited.add(next.id)
    current = next
  }
  return current
}

/** Return a new outputs array with `updates` applied to the matching output. */
export function updateOutputInArray(
  outputs: BroadcastOutput[],
  outputId: string,
  updates: Partial<BroadcastOutput>
): BroadcastOutput[] {
  return outputs.map((o) => (o.id === outputId ? { ...o, ...updates } : o))
}
