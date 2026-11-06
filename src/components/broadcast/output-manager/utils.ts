export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * The built-in outputs own dedicated activation UI (the Display Output and
 * Alternate Output cards in Broadcast Settings), including their own monitor
 * pickers. The Output Manager therefore manages window lifecycle + monitor
 * only for *extra* outputs, so it never double-drives those two.
 */
export function isManagedElsewhere(outputId: string): boolean {
  return outputId === "main" || outputId === "alt"
}
