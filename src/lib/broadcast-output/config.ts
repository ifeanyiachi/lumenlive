/**
 * Output-window configuration parsed from the URL hash (S2 Phase 5).
 *
 * Each output window is opened with a hash fragment like `#output=main&mode=normal`
 * that tells it which output it is and how to render. This pure parser centralizes
 * the defaults ("main" / "normal") so the window entry point doesn't hand-roll
 * `URLSearchParams`.
 */

export interface BroadcastConfig {
  /** Which output this window drives (e.g. "main", "alt"). Defaults to "main". */
  outputId: string
  /** Render mode ("normal" | "stage"). Defaults to "normal". */
  outputMode: string
}

/** Parse `#output=…&mode=…` from a location hash, applying the defaults. */
export function parseBroadcastConfig(hash: string): BroadcastConfig {
  const params = new URLSearchParams(hash.replace(/^#/, ""))
  return {
    outputId: params.get("output") ?? "main",
    outputMode: params.get("mode") ?? "normal",
  }
}
