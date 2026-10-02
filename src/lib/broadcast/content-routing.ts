import type { ContentRouting, LayerFilter } from "@/types/broadcast"

/**
 * Content-routing construction rules, extracted from the old Output Manager so the
 * routing choices (full program / mirror / layer-filter) are built in one tested
 * place and reused by the inline output detail. Pure — no React, store, or Tauri.
 */

/** All layers visible — the sensible default when switching into layer-filter mode. */
export const DEFAULT_LAYER_FILTER: LayerFilter = {
  showContent: true,
  showProps: true,
  showAlerts: true,
  showCountdowns: true,
  showMediaLayer: true,
}

/**
 * Build a {@link ContentRouting} from the routing-type a Select emits. `mirror`
 * seeds its source from `sourceOutputId` (defaulting to the main output);
 * `layer-filter` starts with every layer visible; anything else is a full,
 * independent program feed.
 */
export function routingFromType(
  type: string,
  sourceOutputId = "main"
): ContentRouting {
  if (type === "mirror") return { type: "mirror", sourceOutputId }
  if (type === "layer-filter")
    return { type: "layer-filter", layers: { ...DEFAULT_LAYER_FILTER } }
  return { type: "independent" }
}

/**
 * Toggle one layer of a layer-filter routing, returning a new routing. A no-op
 * (returns the input unchanged) when the routing isn't a layer-filter, so callers
 * can apply it without first narrowing the type.
 */
export function toggleLayer(
  source: ContentRouting,
  layer: keyof LayerFilter,
  value: boolean
): ContentRouting {
  if (source.type !== "layer-filter") return source
  return { type: "layer-filter", layers: { ...source.layers, [layer]: value } }
}
