import type { StateCreator } from "zustand"
import {
  emitOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import { resolveBaseTheme } from "@/lib/broadcast/base-theme"
import { resolveOutputStageLayout } from "@/lib/stage-layout/resolve"
import { buildStageUpdatePayload } from "@/lib/stage-layout/stage-payload"
import { resolveLayerFilter } from "@/lib/broadcast/output-emit"
import {
  findOutput,
  resolveEffectiveOutput,
} from "@/lib/broadcast/output-selectors"
import type { BroadcastState } from "./types"
import { outputDisplayConfig, visibilityPayload } from "./internals"

/**
 * The single emission seam. Every slice that changes what an output should show
 * calls `get().syncBroadcastOutput()` / `syncStageOutput()` rather than emitting
 * directly, so the content-window wire protocol lives in exactly one place.
 */
export type SyncSlice = Pick<
  BroadcastState,
  "syncBroadcastOutput" | "syncBroadcastOutputFor" | "syncStageOutput"
>

export const createSyncSlice: StateCreator<
  BroadcastState,
  [],
  [],
  SyncSlice
> = (_set, get) => ({
  syncBroadcastOutputFor: (outputId: string) => {
    const s = get()
    const output = findOutput(s.outputs, outputId)
    if (!output) return
    // Surface/display config belongs to the physical output window (its
    // monitor), not to any mirrored source, so it uses the output's OWN
    // settings. Re-sent on every sync/resync so a freshly opened window
    // inherits the saved settings.
    emitOutputEvent(
      outputId,
      BROADCAST_EVENTS.displayConfig,
      outputDisplayConfig(output)
    )
    // Black/clear are ephemeral and the logo path is global; re-send so a
    // just-opened or re-synced window inherits the current visibility (and the
    // logo image) instead of flashing content the operator has hidden.
    emitOutputEvent(
      outputId,
      BROADCAST_EVENTS.outputVisibility,
      visibilityPayload(s)
    )
    // A "mirror" output clones its source: follow the chain and drive this
    // window with the *source's* theme + layer filter. Content is shared by
    // all outputs, so mirroring only inherits the presentation. Falls back to
    // the output itself for dangling/cyclic mirrors.
    const effective = resolveEffectiveOutput(s.outputs, outputId) ?? output
    const themeId = effective.themeId
    const theme = s.themes.find((t) => t.id === themeId) ?? s.themes[0]
    if (!theme) return

    // Central base theme: the global override when set, else this output's own
    // theme (Option A). Delivered every sync so the window can composite
    // transparent content over it and reveal it on Clear, regardless of which
    // content mode is live.
    const baseTheme = resolveBaseTheme(s.baseBackground, theme, s.themes)
    emitOutputEvent(outputId, BROADCAST_EVENTS.baseTheme, {
      theme: baseTheme,
    })

    // Active props (marquee/text/image overlays) are otherwise only pushed on
    // mutation via `syncProps`, so a window that opens *after* a prop is already
    // active never learns of it. Re-send the current active set to THIS output
    // on every (re)sync so a freshly opened window shows the running marquee.
    // The compositor still gates by the output's layer filter.
    emitOutputEvent(outputId, BROADCAST_EVENTS.propsUpdate, {
      props: s.props.filter((p) => p.active),
    })

    // A layer-filter output carries its per-output filter on EVERY content
    // payload (verse, slide, media) so the receiving window can suppress
    // props/alerts/countdowns/media/content regardless of which live mode is
    // active — not just while showing a verse.
    const layerFilter = resolveLayerFilter(effective)

    if (!s.isLive) {
      emitOutputEvent(outputId, BROADCAST_EVENTS.verseUpdate, {
        theme,
        verse: null,
        layerFilter,
      })
      return
    }

    if (s.liveSlide) {
      emitOutputEvent(outputId, BROADCAST_EVENTS.slideUpdate, {
        slide: s.liveSlide,
        layerFilter,
      })
    } else if (s.liveMedia) {
      emitOutputEvent(outputId, BROADCAST_EVENTS.mediaUpdate, {
        ...s.liveMedia,
        layerFilter,
      })
    } else {
      emitOutputEvent(outputId, BROADCAST_EVENTS.verseUpdate, {
        theme,
        verse: s.liveVerse,
        layerFilter,
      })
    }
  },
  syncBroadcastOutput: () => {
    const s = get()
    for (const output of s.outputs) {
      if (output.mode === "stage") continue
      get().syncBroadcastOutputFor(output.id)
    }
    get().syncStageOutput()
  },
  syncStageOutput: () => {
    const s = get()
    const stageOutputs = s.outputs.filter((o) => o.mode === "stage")
    for (const output of stageOutputs) {
      const layout = resolveOutputStageLayout(output, s.stageLayouts)
      const theme = s.themes.find((t) => t.id === output.themeId) ?? s.themes[0]
      if (!theme) continue
      emitOutputEvent(
        output.id,
        BROADCAST_EVENTS.stageUpdate,
        buildStageUpdatePayload(layout, theme, {
          currentVerse: s.liveVerse,
          currentSlide: s.liveSlide,
          notes: s.stageNotes,
          timer: s.stageTimer,
          message: s.stageMessages[output.id] ?? null,
          announcement: s.stageAnnouncements[output.id] ?? null,
          playlist: s.stagePlaylist,
        })
      )
    }
  },
})
