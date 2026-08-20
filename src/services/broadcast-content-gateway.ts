/**
 * Broadcast content gateway — the single typed seam for the control window ↔
 * output window(s) event contract.
 *
 * Before this gateway, ~87 raw `"broadcast:*"` event strings were hand-wired on
 * both sides (emit side: `broadcast-store`/`alert-store`/`countdown-store`;
 * listen side: `broadcast-output.tsx`/`output-web-layer.tsx`), and the payload
 * shapes lived only on the listen side — so a payload change on one end would
 * not fail compilation on the other. This module centralizes:
 *
 *   - {@link BROADCAST_EVENTS} — the event-name registry (no more magic strings),
 *   - {@link OutputEventPayloads} / {@link MainEventPayloads} — the payload
 *     shapes, keyed by event name, shared by both windows,
 *   - typed emit + subscribe helpers that make the compiler enforce the contract
 *     on both ends.
 *
 * NOTE: the payload types live here (services), not in `@/types`, because several
 * of them reference lib-layer types (`StageDisplayData`, `MediaFitPayload`,
 * `Surface`) — a pure `@/types` module may not import from `@/lib` without
 * inverting the one-way layer dependency. Services may import from both `lib`
 * and `types`, so this is the correct home for the contract.
 *
 * Forward direction = control (`main`) → output window(s).
 * Reverse direction = output window → control (`main`).
 */
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import type { UnlistenFn, Event as TauriEvent } from "@tauri-apps/api/event"
import { emitToOutput, emitToAllOutputs } from "@/lib/broadcast-routing"
import type {
  BroadcastOutput,
  BroadcastTheme,
  VerseRenderData,
  LayerFilter,
  OutputDisplayMode,
  WebContentPayload,
  BroadcastProp,
  MediaLayerState,
} from "@/types/broadcast"
import type { NdiConfigEventPayload } from "@/types"
import type { Slide } from "@/types/slide"
import type { Theme } from "@/types/theme"
import type {
  ActiveAlert,
  AlertTemplate,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { StageDisplayData } from "@/lib/stage-display-renderer"
import type { MediaFitPayload } from "@/lib/broadcast-output/frame"
import type { Surface } from "@/lib/broadcast-output/surface"
import type { MediaFitConfig, ContainBackground } from "@/lib/media-fit"

// ── Event-name registry ──────────────────────────────────────────────────────

/**
 * Every cross-window event name, in one place. Keys are stable identifiers used
 * in code; values are the wire strings. Renaming a wire string here changes both
 * ends at once.
 */
export const BROADCAST_EVENTS = {
  // Forward: main → output
  verseUpdate: "broadcast:verse-update",
  slideUpdate: "broadcast:slide-update",
  mediaUpdate: "broadcast:media-update",
  mediaFitUpdate: "broadcast:media-fit-update",
  mediaTransport: "broadcast:media-transport",
  mediaLayerUpdate: "broadcast:media-layer-update",
  webContent: "broadcast:web-content",
  webTransport: "broadcast:web-transport",
  propsUpdate: "broadcast:props-update",
  baseTheme: "broadcast:base-theme",
  stageUpdate: "broadcast:stage-update",
  mute: "broadcast:mute",
  outputVisibility: "broadcast:output-visibility",
  displayConfig: "broadcast:display-config",
  ndiConfig: "broadcast:ndi-config",
  alert: "broadcast:alert",
  alertDismiss: "broadcast:alert-dismiss",
  alertDismissAll: "broadcast:alert-dismiss-all",
  countdown: "broadcast:countdown",
  countdownUpdate: "broadcast:countdown-update",
  countdownSync: "broadcast:countdown-sync",
  countdownDismiss: "broadcast:countdown-dismiss",
  countdownDismissAll: "broadcast:countdown-dismiss-all",
  requestResync: "broadcast:request-resync",
  // Reverse: output → main
  mediaProgress: "broadcast:media-progress",
  mediaEnded: "broadcast:media-ended",
  webProgress: "broadcast:web-progress",
  outputReady: "broadcast:output-ready",
} as const

// ── Forward payload shapes (main → output) ───────────────────────────────────

export interface VerseUpdatePayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  layerFilter?: LayerFilter
}

export interface SlideUpdatePayload {
  slide: Slide
  prevSlide?: Slide
  layerFilter?: LayerFilter
  /**
   * Live scripture verse for a presented scripture slide (themeredo.md, flip RF2).
   * Present only when the slide is a live scripture push: its style-only scripture
   * placeholder is filled with this verse at draw time via a `scriptureContent`
   * payload. Absent for ordinary schedule slides.
   */
  verse?: VerseRenderData | null
}

export interface MediaUpdatePayload {
  filePath: string
  mediaType: "image" | "video" | "audio"
  name: string
  trimStart?: number
  trimEnd?: number
  loop?: boolean
  endAction?: "hold" | "stop" | "loop" | "next"
  fit?: MediaFitConfig["fit"]
  zoom?: number
  focalX?: number
  focalY?: number
  containBackground?: ContainBackground
  containBackgroundColor?: string
  layerFilter?: LayerFilter
}

export interface MediaTransportPayload {
  action: "play" | "pause" | "seek"
  position?: number
}

export interface WebTransportPayload {
  action: "play" | "pause" | "seek" | "mute" | "jumpLive"
  position?: number
  muted?: boolean
}

export interface MediaLayerUpdatePayload {
  layer: MediaLayerState | null
}

export interface PropsUpdatePayload {
  props: BroadcastProp[]
}

export interface BaseThemePayload {
  /**
   * The central base/master backdrop, now a typed {@link Theme} painted through the
   * slide renderer (themeredo.md, flip RF3a / decision D1) — was a `BroadcastTheme`.
   */
  theme: Theme
}

export interface MutePayload {
  muted: boolean
}

export interface OutputVisibilityPayload {
  blackout: boolean
  clear: boolean
  logo: boolean
  logoImagePath: string | null
}

export interface DisplayConfigPayload {
  displayMode: OutputDisplayMode
  customResolution: Surface | null
  customFit: "contain" | "cover"
  verseAutoFit: boolean
  maxVerseScale: number
  minVerseFontSize: number
}

export interface AlertPayload {
  alert: ActiveAlert
  template: AlertTemplate
}

export interface AlertDismissPayload {
  alertId: string
}

/** One active countdown plus the timer it came from (and an optional theme). */
export interface CountdownEntry {
  countdown: ActiveCountdown
  timer: CountdownTimer
  // The typed countdown theme the output paints with (themeredo.md, flip F3);
  // resolved control-side and shipped so the output need not reach into a store.
  theme?: Theme
}

export interface CountdownSyncPayload {
  items: CountdownEntry[]
}

export interface CountdownDismissPayload {
  countdownId: string
}

/**
 * Forward events keyed by wire name → payload type. `void` marks events that
 * carry no meaningful payload (the listener ignores it).
 */
export interface OutputEventPayloads {
  "broadcast:verse-update": VerseUpdatePayload
  "broadcast:slide-update": SlideUpdatePayload
  "broadcast:media-update": MediaUpdatePayload
  "broadcast:media-fit-update": MediaFitPayload
  "broadcast:media-transport": MediaTransportPayload
  "broadcast:media-layer-update": MediaLayerUpdatePayload
  "broadcast:web-content": WebContentPayload | null
  "broadcast:web-transport": WebTransportPayload
  "broadcast:props-update": PropsUpdatePayload
  "broadcast:base-theme": BaseThemePayload
  "broadcast:stage-update": StageDisplayData
  "broadcast:mute": MutePayload
  "broadcast:output-visibility": OutputVisibilityPayload
  "broadcast:display-config": DisplayConfigPayload
  "broadcast:ndi-config": NdiConfigEventPayload
  "broadcast:alert": AlertPayload
  "broadcast:alert-dismiss": AlertDismissPayload
  // dismiss-all events carry an empty object on the wire (listener ignores it).
  "broadcast:alert-dismiss-all": Record<string, never>
  "broadcast:countdown": CountdownEntry
  "broadcast:countdown-update": CountdownEntry
  "broadcast:countdown-sync": CountdownSyncPayload
  "broadcast:countdown-dismiss": CountdownDismissPayload
  "broadcast:countdown-dismiss-all": Record<string, never>
  "broadcast:request-resync": void
}

export type OutputEventName = keyof OutputEventPayloads

// ── Reverse payload shapes (output → main) ───────────────────────────────────

export interface MediaProgressPayload {
  position: number
  duration: number
  playing: boolean
  ended: boolean
}

export interface WebProgressPayload {
  position: number
  duration: number
  playing: boolean
  isLive: boolean
  liveEdge: number
}

/** Reverse events keyed by wire name → payload type. */
export interface MainEventPayloads {
  "broadcast:media-progress": MediaProgressPayload
  // media-ended carries an empty object on the wire (kept for faithfulness).
  "broadcast:media-ended": Record<string, never>
  "broadcast:web-progress": WebProgressPayload
  "broadcast:output-ready": void
}

export type MainEventName = keyof MainEventPayloads

// ── Emit (forward: main → output) ────────────────────────────────────────────

// A `void` payload event is called with no payload arg; every other event
// requires its typed payload.
type PayloadArgs<P> = [P] extends [void] ? [] : [payload: P]

/** Emit a forward event to a single output window. */
export function emitOutputEvent<E extends OutputEventName>(
  outputId: string,
  event: E,
  ...args: PayloadArgs<OutputEventPayloads[E]>
): void {
  emitToOutput(outputId, event, args[0])
}

/** Emit a forward event to every enabled output window. */
export function broadcastOutputEvent<E extends OutputEventName>(
  outputs: BroadcastOutput[],
  event: E,
  ...args: PayloadArgs<OutputEventPayloads[E]>
): void {
  emitToAllOutputs(outputs, event, args[0])
}

// ── Subscribe (output side listens to forward events) ────────────────────────

/**
 * Subscribe the current (output) window to a single forward event, typed by name.
 *
 * The handler receives the raw Tauri `Event<payload>` (not the unwrapped payload),
 * so existing `(event) => …event.payload…` call sites migrate 1:1 with no body
 * change. Returns the underlying `listen` promise — callers dispose via its
 * `UnlistenFn`, exactly as before. Use this for per-listener migration in files
 * where handlers are scattered; use {@link subscribeOutputEvents} when a single
 * batch subscription with one disposer is cleaner.
 */
export function listenOutputEvent<E extends OutputEventName>(
  event: E,
  handler: (event: TauriEvent<OutputEventPayloads[E]>) => void
): Promise<UnlistenFn> {
  return getCurrentWebviewWindow().listen<OutputEventPayloads[E]>(
    event,
    handler
  )
}

export type OutputEventHandlers = {
  [E in OutputEventName]?: (payload: OutputEventPayloads[E]) => void
}

/**
 * Subscribe the current (output) window to forward events. Returns a disposer
 * that unlistens every subscription — including any that resolve *after* the
 * disposer runs (so a fast unmount can't orphan a listener).
 */
export function subscribeOutputEvents(
  handlers: OutputEventHandlers
): () => void {
  const win = getCurrentWebviewWindow()
  const unlistens: UnlistenFn[] = []
  let disposed = false

  for (const event of Object.keys(handlers) as OutputEventName[]) {
    const handler = handlers[event] as ((payload: unknown) => void) | undefined
    if (!handler) continue
    void win
      .listen(event, (e) => handler(e.payload))
      .then((un) => {
        if (disposed) un()
        else unlistens.push(un)
      })
      .catch(() => {})
  }

  return () => {
    disposed = true
    while (unlistens.length) unlistens.pop()?.()
  }
}

// ── Emit (reverse: output → main) ────────────────────────────────────────────

/** Emit a reverse event from the current (output) window to the `main` window. */
export function emitToMain<E extends MainEventName>(
  event: E,
  ...args: PayloadArgs<MainEventPayloads[E]>
): void {
  void getCurrentWebviewWindow()
    .emitTo("main", event, args[0])
    .catch(() => {})
}

/** Convenience wrappers for the reverse channel (readability at call sites). */
export const emitMediaProgress = (payload: MediaProgressPayload): void =>
  emitToMain(BROADCAST_EVENTS.mediaProgress, payload)

export const emitMediaEnded = (): void =>
  emitToMain(BROADCAST_EVENTS.mediaEnded, {})

export const emitWebProgress = (payload: WebProgressPayload): void =>
  emitToMain(BROADCAST_EVENTS.webProgress, payload)

export const emitOutputReady = (): void =>
  emitToMain(BROADCAST_EVENTS.outputReady)

// ── Subscribe (main side listens to reverse events) ──────────────────────────

export type MainEventHandlers = {
  [E in MainEventName]?: (payload: MainEventPayloads[E]) => void
}

/**
 * Subscribe the current (`main`) window to reverse events from output windows.
 * Same disposer semantics as {@link subscribeOutputEvents}.
 */
export function subscribeMainEvents(handlers: MainEventHandlers): () => void {
  const win = getCurrentWebviewWindow()
  const unlistens: UnlistenFn[] = []
  let disposed = false

  for (const event of Object.keys(handlers) as MainEventName[]) {
    const handler = handlers[event] as ((payload: unknown) => void) | undefined
    if (!handler) continue
    void win
      .listen(event, (e) => handler(e.payload))
      .then((un) => {
        if (disposed) un()
        else unlistens.push(un)
      })
      .catch(() => {})
  }

  return () => {
    disposed = true
    while (unlistens.length) unlistens.pop()?.()
  }
}
