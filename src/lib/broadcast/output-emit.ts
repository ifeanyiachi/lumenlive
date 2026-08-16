import type { LayerFilter, BroadcastOutput } from "@/types/broadcast"

/**
 * A layer-filter output carries its per-output filter on EVERY content payload
 * (verse / slide / media) so the receiving window can suppress content
 * regardless of which live mode is active. Non-filtered outputs get `undefined`
 * (show everything). Shared by the live sync path and the theme-designer preview.
 */
export function resolveLayerFilter(
  output: BroadcastOutput
): LayerFilter | undefined {
  return output.contentSource.type === "layer-filter"
    ? output.contentSource.layers
    : undefined
}
