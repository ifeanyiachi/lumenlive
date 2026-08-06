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

/** Return a new outputs array with `updates` applied to the matching output. */
export function updateOutputInArray(
  outputs: BroadcastOutput[],
  outputId: string,
  updates: Partial<BroadcastOutput>
): BroadcastOutput[] {
  return outputs.map((o) => (o.id === outputId ? { ...o, ...updates } : o))
}
