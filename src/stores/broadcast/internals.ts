import type { BroadcastOutput } from "@/types"
import { SCRIPTURE_BUILTIN } from "@/lib/theme/builtins"
import {
  emitOutputEvent,
  broadcastOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import {
  resolveEffectiveOutput,
  findOutput,
} from "@/lib/broadcast/output-selectors"
import { resolveLayerFilter } from "@/lib/broadcast/output-emit"
import { buildStageUpdatePayload } from "@/lib/stage-layout/stage-payload"
import type { BroadcastState } from "./types"

/**
 * Internal helpers shared across the broadcast store slices: initial output
 * config, the wire-payload builders, and the small emit routines that several
 * slices reuse. These are deliberately parameterized over `state`/`get` (rather
 * than closing over a store) so any slice can call them. Keeping them here means
 * a single definition instead of one copy per slice.
 */

export const DEFAULT_OUTPUTS: BroadcastOutput[] = [
  {
    id: "main",
    name: "Program",
    themeId: SCRIPTURE_BUILTIN.id,
    mode: "normal",
    contentSource: { type: "independent" },
    enabled: true,
  },
  {
    id: "alt",
    name: "Alt",
    themeId: SCRIPTURE_BUILTIN.id,
    mode: "normal",
    contentSource: { type: "mirror", sourceOutputId: "main" },
    enabled: false,
  },
]

/**
 * Wire payload describing how an output window should size its render surface
 * (see `lib/broadcast-output/surface.ts`). Emitted on every resync and on any
 * change so a freshly opened window inherits the saved settings. Defaults mirror
 * the "missing field" semantics documented on {@link BroadcastOutput}.
 */
export function outputDisplayConfig(output: BroadcastOutput) {
  return {
    displayMode: output.displayMode ?? "native",
    customResolution: output.customResolution ?? null,
    customFit: output.customFit ?? "contain",
    verseAutoFit: output.verseAutoFit ?? true,
    maxVerseScale: output.maxVerseScale ?? 1.5,
    minVerseFontSize: output.minVerseFontSize ?? 40,
  }
}

/** Push an output's current display config to its live window immediately. */
export function pushDisplayConfig(
  get: () => BroadcastState,
  outputId: string
): void {
  const output = findOutput(get().outputs, outputId)
  if (output) {
    emitOutputEvent(
      outputId,
      BROADCAST_EVENTS.displayConfig,
      outputDisplayConfig(output)
    )
  }
}

/**
 * Live-preview the stage draft: push it to any stage output currently assigned
 * the layout being edited, so edits appear on the monitor as they happen (the
 * stage-side analogue of {@link emitDraftToBroadcast}).
 */
export function emitStageDraftToOutputs(state: BroadcastState): void {
  const draft = state.draftStageLayout
  if (!draft) return
  const id = state.editingStageLayoutId
  for (const output of state.outputs) {
    if (output.mode !== "stage" || output.stageLayoutId !== id) continue
    emitOutputEvent(
      output.id,
      BROADCAST_EVENTS.stageUpdate,
      buildStageUpdatePayload(draft, {
        currentVerse: state.liveVerse,
        currentSlide: state.liveSlide,
        notes: state.stageNotes,
        timer: state.stageTimer,
        message: state.stageMessages[output.id] ?? null,
        announcement: state.stageAnnouncements[output.id] ?? null,
        playlist: state.stagePlaylist,
      })
    )
  }
}

export function emitDraftToBroadcast(state: BroadcastState): void {
  if (!state.draftTheme) return
  const id = state.editingThemeId
  for (const output of state.outputs) {
    // Resolve through mirroring so a mirror output previews when its *source's*
    // theme is the one being edited, using the source's filter.
    const effective = resolveEffectiveOutput(state.outputs, output.id) ?? output
    if (effective.themeId === id) {
      emitOutputEvent(output.id, BROADCAST_EVENTS.verseUpdate, {
        theme: state.draftTheme,
        verse: state.liveVerse,
        layerFilter: resolveLayerFilter(effective),
      })
    }
  }
}

// Tear down all web output everywhere: clear each output window's embedded
// YouTube player (`broadcast:web-content` = null). Emits to every output
// regardless of `enabled` so a just-disabled output can't keep a player running
// (emitting to a closed window is a harmless no-op).
export function clearWebOutputs(outputs: BroadcastOutput[]): void {
  for (const output of outputs) {
    emitOutputEvent(output.id, BROADCAST_EVENTS.webContent, null)
  }
}

/** The audience-screen visibility payload sent to output windows. */
export function visibilityPayload(s: BroadcastState) {
  return {
    blackout: s.blackout,
    clear: s.clearForeground,
    logo: s.showLogo,
    logoImagePath: s.logoImagePath,
  }
}

/** Push the current black/clear/logo visibility to every enabled output. */
export function emitVisibility(get: () => BroadcastState): void {
  const s = get()
  broadcastOutputEvent(
    s.outputs,
    BROADCAST_EVENTS.outputVisibility,
    visibilityPayload(s)
  )
}
