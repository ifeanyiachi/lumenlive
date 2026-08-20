import type { StateCreator } from "zustand"
import {
  emitOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import { resolveScriptureTheme, resolveBaseTheme } from "@/lib/theme/resolve"
import type { VerseRenderData } from "@/types/broadcast"
import { presentScripture } from "@/lib/theme/present"
import { themeToSlide } from "@/lib/theme/render"
import { useThemesStore } from "@/stores/themes"
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

    // The output's theme in the NEW typed store (RF2/RF3): resolved via the legacy-id
    // alias, falling back to the scripture built-in. Drives the live scripture slide,
    // the base backdrop, and the idle backdrop.
    const newThemes = useThemesStore.getState().allThemes()
    const outputTheme =
      resolveScriptureTheme(themeId, newThemes) ??
      newThemes.find((t) => t.type === "scripture")

    // Central base theme: the global override when set, else this output's own
    // theme (Option A). Now a typed Theme painted through the slide renderer (RF3a /
    // D1). Delivered every sync so the window can composite transparent content over
    // it and reveal it on Clear, regardless of which content mode is live.
    if (outputTheme) {
      const baseTheme = resolveBaseTheme(s.baseBackground, outputTheme, newThemes)
      emitOutputEvent(outputId, BROADCAST_EVENTS.baseTheme, {
        theme: baseTheme,
      })
    }

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

    // The idle backdrop (not live, or live with nothing pushed): the output's own theme
    // with no content, rendered through the slide path (VR3) so it matches the audience
    // scripture render + the operator preview. A scripture built-in always resolves, so
    // `outputTheme` is present in practice.
    const emitIdleBackdrop = () => {
      if (!outputTheme) return
      emitOutputEvent(outputId, BROADCAST_EVENTS.slideUpdate, {
        slide: {
          ...themeToSlide(outputTheme, () => "idle-backdrop"),
          transition: undefined,
        },
        verse: null,
        layerFilter,
      })
    }

    if (!s.isLive) {
      emitIdleBackdrop()
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
    } else if (s.liveVerse) {
      // Live scripture — the renderer Theme-object flip (RF2). Present the pushed verse
      // as a slide from the output's new-store theme (resolved above): its style-only
      // scripture placeholder is filled at draw time from the verse that rides alongside.
      // A scripture built-in always resolves, so `outputTheme` is present in practice.
      // Transition is stripped so stepping verses swaps instantly.
      if (outputTheme) {
        const [presented] = presentScripture(
          outputTheme,
          { type: "scripture", verse: s.liveVerse },
          () => "live-scripture"
        )
        emitOutputEvent(outputId, BROADCAST_EVENTS.slideUpdate, {
          slide: { ...presented.slide, transition: undefined },
          verse: s.liveVerse,
          layerFilter,
        })
      }
    } else {
      // Live but nothing pushed yet — show the theme backdrop (VR3).
      emitIdleBackdrop()
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
    if (stageOutputs.length === 0) return
    const newThemes = useThemesStore.getState().allThemes()
    for (const output of stageOutputs) {
      const layout = resolveOutputStageLayout(output, s.stageLayouts)

      // Present a live verse as a scripture slide (RF3b), mirroring the audience path,
      // so the stage renders scripture through the slide renderer too. A real schedule
      // slide takes precedence; the verse rides `currentVerse` ONLY for the presented
      // scripture slide (that is how the stage renderer knows to fill it). If no
      // scripture theme resolves, the verse falls back to the legacy renderVerse path.
      let currentSlide = s.liveSlide
      let currentVerse: VerseRenderData | null = null
      if (currentSlide) {
        currentVerse = null
      } else if (s.liveVerse) {
        const scriptureTheme =
          resolveScriptureTheme(output.themeId, newThemes) ??
          newThemes.find((t) => t.type === "scripture")
        if (scriptureTheme) {
          currentSlide = presentScripture(
            scriptureTheme,
            { type: "scripture", verse: s.liveVerse },
            () => "stage-scripture"
          )[0].slide
          currentVerse = s.liveVerse
        } else {
          currentVerse = s.liveVerse
        }
      }

      emitOutputEvent(
        output.id,
        BROADCAST_EVENTS.stageUpdate,
        buildStageUpdatePayload(layout, {
          currentVerse,
          currentSlide,
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
