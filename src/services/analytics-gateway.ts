/**
 * Gateway for anonymous usage analytics (Aptabase).
 *
 * The Aptabase App Key and transport live in the Rust plugin (see
 * `src-tauri/src/lib.rs`); this module is the single frontend boundary that
 * decides *whether* and *what* to send. No component or store calls the SDK
 * directly — they call the typed `track*` functions here.
 *
 * Privacy contract: we never send PII, scripture text, church/service names,
 * media paths, or free-form strings — only fixed event names and small, closed
 * enum properties. Everything is gated behind a runtime opt-out.
 *
 * Layering: this is a `services/` gateway, so it does NOT import the settings
 * store (the dependency direction is store → service). Instead the settings
 * layer pushes the opt-out state down via `setAnalyticsEnabled`.
 */

import { isTauri } from "@/services/tauri-env"

/**
 * Runtime opt-out. Defaults to enabled; the settings layer calls
 * `setAnalyticsEnabled(false)` on hydration when the user has opted out, and on
 * every subsequent toggle. While false, `track` is a hard no-op.
 */
let enabled = true

/** Update the opt-out state. Called by the settings store, not by UI. */
export function setAnalyticsEnabled(value: boolean): void {
  enabled = value
}

/**
 * Feature-usage events we only want to record once per app session (they can
 * fire hundreds of times — e.g. a verse detected on every utterance — and we
 * only care *whether* the feature is used, not how often). Reset naturally when
 * the process restarts.
 */
const seenFeatures = new Set<string>()

/**
 * Core send. Swallows every failure (offline, plugin absent in plain-browser
 * dev, network error) so analytics can never throw into a caller. No-ops when
 * opted out or when not running under Tauri.
 */
async function track(
  name: string,
  props?: Record<string, string | number>
): Promise<void> {
  if (!enabled || !isTauri) return
  try {
    const { trackEvent } = await import("@aptabase/tauri")
    await trackEvent(name, props)
  } catch {
    // Analytics is best-effort; never surface a failure to the caller.
  }
}

/**
 * App opened. Fire once at startup — this is the heartbeat that makes an install
 * count as an active church for the day, independent of which features run.
 */
export function trackAppLaunched(): void {
  void track("app_launched")
}

/** An operator started running a live service (opened/began a schedule). */
export function trackServiceStarted(): void {
  void track("service_started")
}

/**
 * The operator went live to an audience surface. `output` distinguishes the two
 * delivery paths (a fullscreen display window on an external monitor vs an NDI
 * network stream) so we can see which one churches actually use.
 */
export function trackBroadcastStarted(output: "display" | "ndi"): void {
  void track("broadcast_started", { output })
}

/** Which speech-to-text engine a church settled on (cloud vs on-device). */
export function trackSttProvider(
  provider: "deepgram" | "sherpa" | "zipformer"
): void {
  void track("stt_provider_selected", { provider })
}

/**
 * A feature was exercised at least once this session. Deduped per session so a
 * per-utterance event (verse detection) contributes a single data point.
 * `feature` is a fixed slug, never user content.
 */
export function trackFeatureUsed(
  feature: "verse_detection" | "semantic_search" | "lexicon" | "song_slides"
): void {
  if (seenFeatures.has(feature)) return
  seenFeatures.add(feature)
  void track("feature_used", { feature })
}
