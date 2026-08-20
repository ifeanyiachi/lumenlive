import type { StateCreator } from "zustand"
import type { VerseRenderData } from "@/types"
import type { LiveMedia, LiveWeb } from "@/types/broadcast"
import type { Slide } from "@/types/slide"
import {
  broadcastOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import { clearedLiveFields } from "@/lib/broadcast/live-reset"
import { resolveVersePages } from "@/lib/broadcast/pagination-commit"
import { useThemesStore } from "@/stores/themes"
import { toWebContentPayload } from "@/lib/broadcast/web-payload"
import type { BroadcastState, BroadcastSource } from "./types"
import { clearWebOutputs, emitVisibility } from "./internals"

// Monotonic counter stamped onto each presented LiveWeb so re-presenting the
// same video produces a distinct object identity for the preview to remount on.
let webPresentNonce = 0

/**
 * Live/preview content, transports, and audience-screen visibility. Presenting
 * always stages into the `preview*` fields; nothing reaches the audience without
 * an explicit {@link BroadcastState.takeToLive}. The `commit*Live` helpers below
 * are the shared live-push path reused by `takeToLive`.
 */
export type LiveTransportSlice = Pick<
  BroadcastState,
  | "isLive"
  | "liveVerse"
  | "liveVersePages"
  | "liveVersePageIndex"
  | "liveSlide"
  | "liveMedia"
  | "liveWeb"
  | "previewVerse"
  | "previewSlide"
  | "previewMedia"
  | "previewWeb"
  | "previewSource"
  | "previewPending"
  | "mediaTransport"
  | "webTransport"
  | "broadcastSource"
  | "interlinearText"
  | "broadcastMuted"
  | "blackout"
  | "clearForeground"
  | "showLogo"
  | "logoImagePath"
  | "baseBackground"
  | "setLive"
  | "takeToLive"
  | "setLiveVerse"
  | "setLiveSlide"
  | "setLiveMedia"
  | "updateLiveMediaFit"
  | "setLiveWeb"
  | "clearLiveWeb"
  | "syncWebOutput"
  | "followManualSelection"
  | "setInterlinearText"
  | "setBroadcastMuted"
  | "toggleBlackout"
  | "toggleClearForeground"
  | "setLogoImage"
  | "toggleLogo"
  | "setBaseBackground"
  | "sendMediaTransport"
  | "setMediaTransport"
  | "sendWebTransport"
  | "setWebTransport"
  | "nextVersePage"
  | "prevVersePage"
>

export const createLiveTransportSlice: StateCreator<
  BroadcastState,
  [],
  [],
  LiveTransportSlice
> = (set, get) => {
  // ── Live-commit helpers ──
  // These perform the actual push to the live output(s): they set the `live*`
  // fields (clearing the others), reset transports, stamp the broadcast source,
  // and emit to the output windows. The public `setLive*` actions stage into
  // `preview*` instead; these run once the operator takes. Keeping them separate
  // lets `takeToLive` reuse the exact live-push path.
  const commitVerseLive = (
    liveVerse: VerseRenderData | null,
    source?: BroadcastSource
  ) => {
    const s = get()
    const hadWeb = s.liveWeb !== null
    // Paginate long multi-verse blocks so they stay readable (see
    // resolveVersePages): single pages leave `liveVersePages` null and `liveVerse`
    // always points at the current page, so the emit path renders it unchanged.
    const pages = resolveVersePages(
      liveVerse,
      s.outputs,
      useThemesStore.getState().allThemes()
    )
    set({
      ...clearedLiveFields(),
      liveVerse: pages[0] ?? liveVerse,
      liveVersePages: pages.length > 1 ? pages : null,
      broadcastSource: source ?? null,
    })
    if (hadWeb) clearWebOutputs(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitSlideLive = (
    liveSlide: Slide | null,
    source?: BroadcastSource
  ) => {
    const hadWeb = get().liveWeb !== null
    set({
      ...clearedLiveFields(),
      liveSlide,
      broadcastSource: source ?? null,
    })
    if (hadWeb) clearWebOutputs(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitMediaLive = (
    liveMedia: LiveMedia | null,
    source?: BroadcastSource
  ) => {
    const hadWeb = get().liveWeb !== null
    set({
      ...clearedLiveFields(),
      liveMedia,
      broadcastSource: source ?? null,
    })
    if (hadWeb) clearWebOutputs(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitWebLive = (web: LiveWeb | null, source?: BroadcastSource) => {
    // Stamp a fresh nonce so presenting the same video again is a new identity
    // — the operator preview keys its iframe on it and remounts (replays from
    // the start). The audience overlay already reloads on every syncWebOutput.
    const stamped = web ? { ...web, nonce: ++webPresentNonce } : null
    set({
      ...clearedLiveFields(),
      liveWeb: stamped,
      broadcastSource: source ?? null,
    })
    get().syncWebOutput()
  }

  return {
    isLive: false,
    liveVerse: null,
    liveVersePages: null,
    liveVersePageIndex: 0,
    liveSlide: null,
    liveMedia: null,
    liveWeb: null,
    previewVerse: null,
    previewSlide: null,
    previewMedia: null,
    previewWeb: null,
    previewSource: null,
    previewPending: false,
    mediaTransport: null,
    webTransport: null,
    broadcastSource: null,
    interlinearText: null,
    broadcastMuted: false,
    blackout: false,
    clearForeground: false,
    showLogo: false,
    logoImagePath: null,
    baseBackground: null,

    setLive: (isLive) => {
      set({ isLive })
      if (!isLive) {
        // Going off-air clears any pending stage so the next go-live starts clean.
        set({ previewPending: false })
        if (get().liveWeb) clearWebOutputs(get().outputs)
      }
      get().syncBroadcastOutput()
      if (isLive && get().liveWeb) {
        get().syncWebOutput()
      }
    },
    takeToLive: () => {
      const s = get()
      if (!s.previewPending) return
      set({ previewPending: false })
      if (s.previewWeb) commitWebLive(s.previewWeb, s.previewSource)
      else if (s.previewMedia) commitMediaLive(s.previewMedia, s.previewSource)
      else if (s.previewSlide) commitSlideLive(s.previewSlide, s.previewSource)
      else commitVerseLive(s.previewVerse, s.previewSource)
    },
    setLiveVerse: (verse, source) => {
      // Always stage into the preview (clearing the other preview kinds) so the
      // Program preview shows it. Presenting never touches the audience — the
      // operator pushes the staged item live with takeToLive (play / Enter).
      set({
        previewVerse: verse,
        previewSlide: null,
        previewMedia: null,
        previewWeb: null,
        previewSource: source ?? null,
        previewPending: true,
      })
    },
    setLiveSlide: (slide, source) => {
      set({
        previewSlide: slide,
        previewVerse: null,
        previewMedia: null,
        previewWeb: null,
        previewSource: source ?? null,
        previewPending: true,
      })
    },
    setLiveMedia: (media, source) => {
      set({
        previewMedia: media,
        previewSlide: null,
        previewVerse: null,
        previewWeb: null,
        previewSource: source ?? null,
        previewPending: true,
      })
    },
    updateLiveMediaFit: (fit) => {
      const s = get()
      if (!s.liveMedia) return
      const patch: Partial<BroadcastState> = {
        liveMedia: { ...s.liveMedia, ...fit },
      }
      // Keep the preview mirror in lockstep, but only when it's the same item
      // (i.e. unlocked/follow mode) — never stamp the live item's fit onto a
      // different item staged in the preview.
      if (s.previewMedia && s.previewMedia.filePath === s.liveMedia.filePath) {
        patch.previewMedia = { ...s.previewMedia, ...fit }
      }
      set(patch)
      // Fit-only update: change how the frame is drawn without re-loading the
      // source (so video/audio keep playing from the current position).
      broadcastOutputEvent(get().outputs, BROADCAST_EVENTS.mediaFitUpdate, fit)
    },
    setLiveWeb: (web, source) => {
      // Stamp a fresh nonce so re-presenting the same video is a new identity —
      // the operator preview keys its iframe on it and remounts (replays from the
      // start). commitWebLive stamps its own nonce for the live monitor.
      const stagedPreview = web ? { ...web, nonce: ++webPresentNonce } : null
      set({
        previewWeb: stagedPreview,
        previewSlide: null,
        previewVerse: null,
        previewMedia: null,
        previewSource: source ?? null,
        previewPending: true,
      })
    },
    clearLiveWeb: () => {
      set({ liveWeb: null, previewWeb: null, webTransport: null })
      clearWebOutputs(get().outputs)
    },
    syncWebOutput: () => {
      const s = get()
      if (!s.liveWeb || !s.isLive) return
      const web = s.liveWeb
      // Web output is YouTube-only. It plays inside each output window (no
      // separate overlay window): push the cue to every ENABLED output and its
      // `OutputWebLayer` mounts and drives the IFrame Player API.
      if (!web.isYouTube || !web.videoId) return
      broadcastOutputEvent(
        s.outputs,
        BROADCAST_EVENTS.webContent,
        toWebContentPayload(web, s.broadcastMuted)
      )
    },
    followManualSelection: () =>
      set({
        previewVerse: null,
        previewSlide: null,
        previewMedia: null,
        previewWeb: null,
        previewSource: null,
        broadcastSource: null,
      }),
    setInterlinearText: (interlinearText) => set({ interlinearText }),
    setBroadcastMuted: (broadcastMuted) => {
      set({ broadcastMuted })
      broadcastOutputEvent(get().outputs, BROADCAST_EVENTS.mute, {
        muted: broadcastMuted,
      })
      const web = get().liveWeb
      if (web?.isYouTube && web.videoId) {
        // The embedded output player follows broadcast:mute above; send an
        // explicit transport mute too so its state is unambiguous.
        get().sendWebTransport("mute", { muted: broadcastMuted })
      }
    },
    // Black / Clear / Logo are mutually exclusive audience-screen states: the
    // screen is in exactly one at a time, so turning one on clears the others.
    // This keeps every key press visible (no hidden state under a higher layer);
    // pressing the active one again returns to normal.
    toggleBlackout: () => {
      const on = !get().blackout
      set(
        on
          ? { blackout: true, clearForeground: false, showLogo: false }
          : { blackout: false }
      )
      emitVisibility(get)
    },
    toggleClearForeground: () => {
      const on = !get().clearForeground
      set(
        on
          ? { clearForeground: true, blackout: false, showLogo: false }
          : { clearForeground: false }
      )
      emitVisibility(get)
    },
    setLogoImage: (logoImagePath) => {
      set({ logoImagePath })
      // Drop the holding logo if its image was cleared.
      if (!logoImagePath && get().showLogo) set({ showLogo: false })
      emitVisibility(get)
    },
    toggleLogo: () => {
      // A logo with no configured image would just be a black holding screen —
      // ignore until one is set (the UI also disables the control).
      if (!get().showLogo && !get().logoImagePath) return
      const on = !get().showLogo
      set(
        on
          ? { showLogo: true, blackout: false, clearForeground: false }
          : { showLogo: false }
      )
      emitVisibility(get)
    },
    setBaseBackground: (baseBackground) => {
      set({ baseBackground })
      // Re-sync so every output receives the new base background immediately.
      get().syncBroadcastOutput()
    },
    sendMediaTransport: (action, position) => {
      broadcastOutputEvent(get().outputs, BROADCAST_EVENTS.mediaTransport, {
        action,
        position,
      })
    },
    setMediaTransport: (mediaTransport) => set({ mediaTransport }),
    sendWebTransport: (action, opts) => {
      // Routed to the output windows: the embedded YouTube player (OutputWebLayer)
      // now lives inside each output, not in a separate overlay window.
      broadcastOutputEvent(get().outputs, BROADCAST_EVENTS.webTransport, {
        action,
        position: opts?.position,
        muted: opts?.muted,
      })
    },
    setWebTransport: (webTransport) => set({ webTransport }),
    nextVersePage: () => {
      const s = get()
      if (!s.liveVersePages) return false
      const next = s.liveVersePageIndex + 1
      if (next >= s.liveVersePages.length) return false
      set({ liveVersePageIndex: next, liveVerse: s.liveVersePages[next] })
      get().syncBroadcastOutput()
      return true
    },
    prevVersePage: () => {
      const s = get()
      if (!s.liveVersePages) return false
      const prev = s.liveVersePageIndex - 1
      if (prev < 0) return false
      set({ liveVersePageIndex: prev, liveVerse: s.liveVersePages[prev] })
      get().syncBroadcastOutput()
      return true
    },
  }
}
