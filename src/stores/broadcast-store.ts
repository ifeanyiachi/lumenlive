import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import { load, type Store } from "@tauri-apps/plugin-store"
import type {
  BroadcastTheme,
  VerseRenderData,
  StageDisplayConfig,
  BroadcastOutput,
  StageLayout,
  ZoneSource,
} from "@/types"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import { BUILTIN_STAGE_LAYOUTS } from "@/lib/stage-layout/builtin-stage-layouts"
import { resolveOutputStageLayout } from "@/lib/stage-layout/resolve"
import type { StageTimer } from "@/lib/stage-display-renderer"
import type { Slide } from "@/types/slide"
import type {
  MediaEndAction,
  MediaMarker,
  MediaFit,
  ContainBackground,
} from "@/types/schedule"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import {
  emitToOutput,
  emitToAllOutputs,
  emitToAllOverlays,
} from "@/lib/broadcast-routing"
import * as themeEditing from "@/lib/broadcast/theme-editing"
import * as stageEditing from "@/lib/stage-layout/editing"
import * as history from "@/lib/broadcast/undo-history"
import {
  findOutput,
  resolveThemeId,
  updateOutputInArray,
} from "@/lib/broadcast/output-selectors"

export type BroadcastSource = "schedule" | "queue" | "manual" | null
type SelectedElement = string | null
type RegionId = "textArea" | "verse" | "reference"

export interface BroadcastProp {
  id: string
  /**
   * `text` is a static box, `image` a cached bitmap, and `marquee` a single
   * line of text that scrolls horizontally and loops seamlessly (a ticker /
   * "crawl", like ProPresenter's scrolling Messages or EasyWorship Alerts).
   */
  name: string
  type: "text" | "image" | "marquee"
  x: number
  y: number
  width: number
  height: number
  active: boolean
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  color?: string
  backgroundColor?: string
  /** Horizontal alignment of the text within the box. Defaults to "center". */
  textAlign?: "left" | "center" | "right"
  imageUrl?: string
  opacity?: number
  /** Marquee scroll speed in px/sec at a 1920px-wide canvas (scaled to output). */
  scrollSpeed?: number
  /** Marquee travel direction. Defaults to "left" (text enters from the right). */
  scrollDirection?: "left" | "right"
}

export interface LiveMedia {
  filePath: string
  mediaType: "image" | "video" | "audio"
  name: string
  /** Playback in-point in seconds (video/audio). */
  trimStart?: number
  /** Playback out-point in seconds (video/audio). */
  trimEnd?: number
  /** Loop playback between trim points. */
  loop?: boolean
  /** What to do when playback reaches the out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points for jump-to-marker. */
  markers?: MediaMarker[]
  /** How the image/video fills the output frame. Defaults to "cover". */
  fit?: MediaFit
  /** Extra scale multiplier applied when `fit` is "zoom" (>= 1). Defaults to 1. */
  zoom?: number
  /** Horizontal focal point (0..1) used when cropping. Defaults to 0.5. */
  focalX?: number
  /** Vertical focal point (0..1) used when cropping. Defaults to 0.5. */
  focalY?: number
  /** Letterbox fill when `fit` is "contain". Defaults to "black". */
  containBackground?: ContainBackground
  /** Solid color used when `containBackground` is "color". */
  containBackgroundColor?: string
}

/** The subset of a media item that controls how it fills the output frame. */
export type MediaFitUpdate = Pick<
  LiveMedia,
  | "fit"
  | "zoom"
  | "focalX"
  | "focalY"
  | "containBackground"
  | "containBackgroundColor"
>

export interface MediaTransportState {
  /** Current playback position of the live output, in seconds. */
  position: number
  /** Duration of the live media, in seconds (0 if unknown). */
  duration: number
  /** Whether the live output is currently playing. */
  playing: boolean
}

/** Live playback position echoed from the controllable YouTube overlay. */
export interface WebTransportState {
  /** Current position within the video/DVR window, in seconds. */
  position: number
  /** Duration (VOD) or seekable DVR length (live), in seconds. */
  duration: number
  /** Whether the overlay player is currently playing. */
  playing: boolean
  /** Whether the source is a live stream. */
  isLive: boolean
  /** Seconds corresponding to the live edge (0 when not live). */
  liveEdge: number
}

export interface MediaLayerState {
  filePath: string
  mediaType: "image" | "video"
  name: string
  active: boolean
}

export interface LiveWeb {
  url: string
  isYouTube: boolean
  videoId?: string
  /** Whether this is a live stream (vs a recorded VOD). */
  isLive?: boolean
  /** Start offset in seconds (join-late / skip pre-service). */
  startTime?: number
  /** End offset in seconds (VOD only; stops before the end-screen grid). */
  endTime?: number
  /** What to do when a VOD reaches its out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points (absolute for VOD, DVR offsets for live). */
  markers?: MediaMarker[]
  /**
   * Bumped on every {@link BroadcastState.setLiveWeb} call. Re-presenting the
   * same video keeps `videoId`/`url` identical, so this nonce is what the
   * operator preview keys its iframe on to force a remount — i.e. replay from
   * the start — each time the item is presented again.
   */
  nonce?: number
}

// Monotonic counter stamped onto each presented LiveWeb so re-presenting the
// same video produces a distinct object identity for the preview to remount on.
let webPresentNonce = 0

const DEFAULT_OUTPUTS: BroadcastOutput[] = [
  {
    id: "main",
    name: "Program",
    themeId: BUILTIN_THEMES[0].id,
    mode: "normal",
    contentSource: { type: "independent" },
    enabled: true,
  },
  {
    id: "alt",
    name: "Alt",
    themeId: BUILTIN_THEMES[0].id,
    mode: "normal",
    contentSource: { type: "mirror", sourceOutputId: "main" },
    enabled: false,
  },
]

interface BroadcastState {
  themes: BroadcastTheme[]
  stageLayouts: StageLayout[]
  outputs: BroadcastOutput[]
  isLive: boolean
  liveVerse: VerseRenderData | null
  liveSlide: Slide | null
  liveMedia: LiveMedia | null
  liveWeb: LiveWeb | null
  /**
   * When true (and {@link isLive} is on), presenting an item stages it into the
   * `preview*` fields only — the live output windows stay frozen on whatever was
   * last taken. The operator can audition items in the Program preview without
   * the audience seeing them, then push the staged item live via
   * {@link BroadcastState.takeToLive} or by unlocking. Reset whenever live is
   * turned off, since a lock only makes sense while broadcasting.
   */
  liveLocked: boolean
  /** Staged (preview-only) counterparts of the `live*` fields; see {@link liveLocked}. */
  previewVerse: VerseRenderData | null
  previewSlide: Slide | null
  previewMedia: LiveMedia | null
  previewWeb: LiveWeb | null
  previewSource: BroadcastSource
  /**
   * True when the staged preview has diverged from what's live (something was
   * presented while locked). Gates the Take action and prevents unlock from
   * needlessly re-committing — and thus restarting — the already-live item.
   */
  previewPending: boolean
  mediaTransport: MediaTransportState | null
  webTransport: WebTransportState | null
  broadcastSource: BroadcastSource
  interlinearText: string | null
  broadcastMuted: boolean

  mediaLayer: MediaLayerState | null
  props: BroadcastProp[]

  stageNotes: string | null
  // Live source feeds for stage zones (Phase 4).
  stageTimer: StageTimer | null
  stageMessage: string | null
  stageAnnouncement: string | null
  stagePlaylist: string[] | null

  isDesignerOpen: boolean
  editingThemeId: string | null
  draftTheme: BroadcastTheme | null
  selectedElement: SelectedElement
  regionLocked: Set<RegionId>
  regionHidden: Set<RegionId>
  undoStack: BroadcastTheme[]
  redoStack: BroadcastTheme[]
  transitionPreviewTrigger: number

  // Stage Layout designer (draft editing — stage-side sibling of the theme draft)
  stageDesignerOpen: boolean
  editingStageLayoutId: string | null
  draftStageLayout: StageLayout | null
  selectedZone: string | null
  stageUndoStack: StageLayout[]
  stageRedoStack: StageLayout[]

  // Theme management
  loadThemes: () => void
  saveTheme: (theme: BroadcastTheme) => void
  deleteTheme: (id: string) => void
  duplicateTheme: (id: string) => void
  createNewTheme: () => void
  renameTheme: (id: string, name: string) => void
  togglePinTheme: (id: string) => void

  // Stage Layout management (stage-side sibling of theme management)
  saveStageLayout: (layout: StageLayout) => void
  deleteStageLayout: (id: string) => void
  duplicateStageLayout: (id: string) => void
  renameStageLayout: (id: string, name: string) => void
  togglePinStageLayout: (id: string) => void
  createNewStageLayout: () => void

  // Stage Layout designer (draft editing)
  setStageDesignerOpen: (open: boolean) => void
  startEditingStageLayout: (id: string) => void
  pushStageUndo: () => void
  updateStageDraft: (updates: Partial<StageLayout>) => void
  updateStageDraftNested: (path: string, value: unknown) => void
  setSelectedZone: (id: string | null) => void
  addZone: (source: ZoneSource) => void
  removeZone: (id: string) => void
  reorderStageLayers: (fromIndex: number, toIndex: number) => void
  toggleZoneVisibility: (id: string) => void
  toggleZoneLocked: (id: string) => void
  duplicateZone: (id: string) => void
  nudgeZone: (dx: number, dy: number) => void
  stageUndo: () => void
  stageRedo: () => void
  saveStageDraft: () => void
  discardStageDraft: () => void

  setActiveTheme: (id: string) => void
  setAltActiveTheme: (id: string) => void
  setLive: (live: boolean) => void
  /** Engage/release the live lock (see {@link liveLocked}). Unlocking takes any pending preview. */
  setLiveLocked: (locked: boolean) => void
  /** Push the currently-staged preview item to the live output(s). No-op when nothing is pending. */
  takeToLive: () => void
  setLiveVerse: (
    verse: VerseRenderData | null,
    source?: BroadcastSource
  ) => void
  setLiveSlide: (slide: Slide | null, source?: BroadcastSource) => void
  setLiveMedia: (media: LiveMedia | null, source?: BroadcastSource) => void
  /** Patch the fit/pan/background of the currently-live media without restarting playback. */
  updateLiveMediaFit: (fit: MediaFitUpdate) => void
  setLiveWeb: (web: LiveWeb | null, source?: BroadcastSource) => void
  clearLiveWeb: () => void
  syncWebOutput: () => void
  /**
   * Return the Program preview to manual (operator-driven) ownership so it
   * follows the currently-selected verse. Presenting a queue/schedule item
   * pins `previewSource` to `"queue"`/`"schedule"`, which makes the preview
   * render the staged `previewVerse` and ignore later verse selections and the
   * interlinear toggle. Call this whenever the operator manually picks a verse
   * (or toggles interlinear) to release that pin. Only touches the staged
   * `preview*` fields and the source labels — never `live*` — so a live lock
   * keeps auditioning safely.
   */
  followManualSelection: () => void
  setInterlinearText: (text: string | null) => void
  setBroadcastMuted: (muted: boolean) => void
  sendMediaTransport: (
    action: "play" | "pause" | "seek",
    position?: number
  ) => void
  setMediaTransport: (transport: MediaTransportState | null) => void
  sendWebTransport: (
    action: "play" | "pause" | "seek" | "mute" | "jumpLive",
    opts?: { position?: number; muted?: boolean }
  ) => void
  setWebTransport: (transport: WebTransportState | null) => void
  setMediaLayer: (layer: MediaLayerState | null) => void
  toggleMediaLayer: () => void
  syncMediaLayer: () => void
  addProp: (prop: BroadcastProp) => void
  updateProp: (id: string, updates: Partial<BroadcastProp>) => void
  removeProp: (id: string) => void
  toggleProp: (id: string) => void
  syncProps: () => void
  syncBroadcastOutput: () => void
  syncBroadcastOutputFor: (outputId: string) => void

  // Output management
  addOutput: (output: BroadcastOutput) => void
  removeOutput: (outputId: string) => void
  updateOutput: (outputId: string, updates: Partial<BroadcastOutput>) => void
  getOutput: (outputId: string) => BroadcastOutput | undefined
  getOutputThemeId: (outputId: string) => string

  // Stage display
  updateStageConfig: (
    outputId: string,
    updates: Partial<StageDisplayConfig>
  ) => void
  setStageNotes: (notes: string | null) => void
  setStageTimer: (timer: StageTimer | null) => void
  setStageMessage: (message: string | null) => void
  setStageAnnouncement: (announcement: string | null) => void
  setStagePlaylist: (playlist: string[] | null) => void
  syncStageOutput: () => void

  // Designer actions
  setDesignerOpen: (open: boolean) => void
  startEditing: (themeId: string) => void
  pushUndo: () => void
  updateDraft: (updates: Partial<BroadcastTheme>) => void
  updateDraftNested: (path: string, value: unknown) => void
  undo: () => void
  redo: () => void
  saveDraft: () => void
  discardDraft: () => void
  setSelectedElement: (el: SelectedElement) => void
  toggleRegionLocked: (id: RegionId) => void
  toggleRegionHidden: (id: RegionId) => void
  addElement: (type: "image" | "shape") => void
  removeElement: (id: string) => void
  reorderLayers: (fromIndex: number, toIndex: number) => void
  toggleElementVisibility: (id: string) => void
  toggleElementLocked: (id: string) => void
  triggerTransitionPreview: () => void
  duplicateElement: (id: string) => void
  nudgeElement: (dx: number, dy: number) => void
}

let lastUndoPush = 0
let lastStageUndoPush = 0
const UNDO_DEBOUNCE_MS = 300

/**
 * Live-preview the stage draft: push it to any stage output currently assigned
 * the layout being edited, so edits appear on the monitor as they happen (the
 * stage-side analogue of {@link emitDraftToBroadcast}).
 */
function emitStageDraftToOutputs(state: BroadcastState): void {
  const draft = state.draftStageLayout
  if (!draft) return
  const id = state.editingStageLayoutId
  for (const output of state.outputs) {
    if (output.mode !== "stage" || output.stageLayoutId !== id) continue
    const theme =
      state.themes.find((t) => t.id === output.themeId) ?? state.themes[0]
    if (!theme) continue
    emitToOutput(output.id, "broadcast:stage-update", {
      layout: draft,
      currentTheme: theme,
      currentVerse: state.liveVerse,
      currentSlide: state.liveSlide,
      notes: state.stageNotes,
      timer: state.stageTimer,
      message: state.stageMessage,
      announcement: state.stageAnnouncement,
      playlist: state.stagePlaylist,
    })
  }
}

function emitDraftToBroadcast(state: BroadcastState): void {
  if (!state.draftTheme) return
  const id = state.editingThemeId
  for (const output of state.outputs) {
    if (output.themeId === id) {
      emitToOutput(output.id, "broadcast:verse-update", {
        theme: state.draftTheme,
        verse: state.liveVerse,
      })
    }
  }
}

function closeWebOverlays(outputs: BroadcastOutput[]): void {
  for (const output of outputs) {
    void invoke("close_web_overlay", { outputId: output.id }).catch(() => {})
  }
}

export const useBroadcastStore = create<BroadcastState>((set, get) => {
  // ── Live-commit helpers ──
  // These perform the actual push to the live output(s): they set the `live*`
  // fields (clearing the others), reset transports, stamp the broadcast source,
  // and emit to the output windows. The public `setLive*` actions delegate here
  // when unlocked; when locked they stage into `preview*` instead and these run
  // only once the operator takes/unlocks. Keeping them separate lets
  // `takeToLive` reuse the exact live-push path.
  const commitVerseLive = (
    liveVerse: VerseRenderData | null,
    source?: BroadcastSource
  ) => {
    const hadWeb = get().liveWeb !== null
    set({
      liveVerse,
      liveSlide: null,
      liveMedia: null,
      liveWeb: null,
      mediaTransport: null,
      webTransport: null,
      broadcastSource: source ?? null,
    })
    if (hadWeb) closeWebOverlays(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitSlideLive = (
    liveSlide: Slide | null,
    source?: BroadcastSource
  ) => {
    const hadWeb = get().liveWeb !== null
    set({
      liveSlide,
      liveVerse: null,
      liveMedia: null,
      liveWeb: null,
      mediaTransport: null,
      webTransport: null,
      broadcastSource: source ?? null,
    })
    if (hadWeb) closeWebOverlays(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitMediaLive = (
    liveMedia: LiveMedia | null,
    source?: BroadcastSource
  ) => {
    const hadWeb = get().liveWeb !== null
    set({
      liveMedia,
      liveSlide: null,
      liveVerse: null,
      liveWeb: null,
      mediaTransport: null,
      webTransport: null,
      broadcastSource: source ?? null,
    })
    if (hadWeb) closeWebOverlays(get().outputs)
    get().syncBroadcastOutput()
  }
  const commitWebLive = (web: LiveWeb | null, source?: BroadcastSource) => {
    // Stamp a fresh nonce so presenting the same video again is a new identity
    // — the operator preview keys its iframe on it and remounts (replays from
    // the start). The audience overlay already reloads on every syncWebOutput.
    const stamped = web ? { ...web, nonce: ++webPresentNonce } : null
    set({
      liveWeb: stamped,
      liveSlide: null,
      liveVerse: null,
      liveMedia: null,
      mediaTransport: null,
      webTransport: null,
      broadcastSource: source ?? null,
    })
    get().syncWebOutput()
  }

  return {
    themes: [...BUILTIN_THEMES],
    stageLayouts: [...BUILTIN_STAGE_LAYOUTS],
    outputs: DEFAULT_OUTPUTS.map((o) => ({ ...o })),
    isLive: false,
    liveVerse: null,
    liveSlide: null,
    liveMedia: null,
    liveWeb: null,
    liveLocked: false,
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
    mediaLayer: null,
    props: [],
    stageNotes: null,
    stageTimer: null,
    stageMessage: null,
    stageAnnouncement: null,
    stagePlaylist: null,
    stageDesignerOpen: false,
    editingStageLayoutId: null,
    draftStageLayout: null,
    selectedZone: null,
    stageUndoStack: [],
    stageRedoStack: [],
    isDesignerOpen: false,
    editingThemeId: null,
    draftTheme: null,
    selectedElement: null,
    regionLocked: new Set<RegionId>(),
    regionHidden: new Set<RegionId>(),
    undoStack: [],
    redoStack: [],
    transitionPreviewTrigger: 0,

    loadThemes: () => {
      set({ themes: [...BUILTIN_THEMES] })
    },
    saveTheme: (theme) =>
      set((s) => ({
        themes: s.themes.some((t) => t.id === theme.id)
          ? s.themes.map((t) => (t.id === theme.id ? theme : t))
          : [...s.themes, theme],
      })),
    deleteTheme: (id) =>
      set((s) => ({
        themes: s.themes.filter((t) => t.id !== id || t.builtin),
      })),
    duplicateTheme: (id) => {
      const s = get()
      const source = s.themes.find((t) => t.id === id)
      if (!source) return
      const newTheme: BroadcastTheme = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        builtin: false,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => ({ themes: [...s.themes, newTheme] }))
    },
    createNewTheme: () => {
      const source = BUILTIN_THEMES[0]
      const newTheme: BroadcastTheme = {
        ...source,
        id: crypto.randomUUID(),
        name: "Untitled Theme",
        category: "general",
        builtin: false,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        elements: [],
        layerOrder: ["textArea", "verse", "reference"],
        verseText: {
          ...source.verseText,
          fontSize: 48,
        },
        background: {
          type: "solid",
          color: "#000000",
          gradient: null,
          image: null,
          video: null,
        },
      }
      set((s) => ({ themes: [...s.themes, newTheme] }))
      get().startEditing(newTheme.id)
    },
    renameTheme: (id, name) =>
      set((s) => ({
        themes: s.themes.map((t) =>
          t.id === id && !t.builtin ? { ...t, name, updatedAt: Date.now() } : t
        ),
        draftTheme:
          s.draftTheme?.id === id
            ? { ...s.draftTheme, name, updatedAt: Date.now() }
            : s.draftTheme,
      })),
    togglePinTheme: (id) =>
      set((s) => ({
        themes: s.themes.map((t) =>
          t.id === id ? { ...t, pinned: !t.pinned, updatedAt: Date.now() } : t
        ),
      })),

    // ── Stage Layout CRUD ──
    // Mirrors the theme CRUD above: built-ins are non-deletable, duplicates and
    // renames only touch custom layouts, and pins are per-layout.
    saveStageLayout: (layout) => {
      set((s) => ({
        stageLayouts: s.stageLayouts.some((l) => l.id === layout.id)
          ? s.stageLayouts.map((l) => (l.id === layout.id ? layout : l))
          : [...s.stageLayouts, layout],
      }))
      // Re-emit so any stage output pointing at this preset reflects the edit.
      get().syncStageOutput()
    },
    deleteStageLayout: (id) =>
      set((s) => ({
        stageLayouts: s.stageLayouts.filter((l) => l.id !== id || l.builtin),
      })),
    duplicateStageLayout: (id) => {
      const s = get()
      const source = s.stageLayouts.find((l) => l.id === id)
      if (!source) return
      const newLayout: StageLayout = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        builtin: false,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => ({ stageLayouts: [...s.stageLayouts, newLayout] }))
    },
    renameStageLayout: (id, name) =>
      set((s) => ({
        stageLayouts: s.stageLayouts.map((l) =>
          l.id === id && !l.builtin ? { ...l, name, updatedAt: Date.now() } : l
        ),
      })),
    togglePinStageLayout: (id) =>
      set((s) => ({
        stageLayouts: s.stageLayouts.map((l) =>
          l.id === id ? { ...l, pinned: !l.pinned, updatedAt: Date.now() } : l
        ),
      })),
    createNewStageLayout: () => {
      const now = Date.now()
      const layout: StageLayout = {
        id: crypto.randomUUID(),
        name: "New Stage Layout",
        builtin: false,
        pinned: false,
        createdAt: now,
        updatedAt: now,
        resolution: { width: 1920, height: 1080 },
        background: {
          type: "solid",
          color: "#1a1a2e",
          gradient: null,
          image: null,
          video: null,
        },
        displayMode: "zone",
        zones: [],
        elements: [],
        layerOrder: [],
      }
      set((s) => ({ stageLayouts: [...s.stageLayouts, layout] }))
      get().startEditingStageLayout(layout.id)
    },

    // ── Stage Layout designer (draft editing) ──
    // Mirrors the theme draft machinery: an editable `draftStageLayout` with its
    // own undo/redo stacks and debounced snapshots (CLAUDE.md gesture rule).
    setStageDesignerOpen: (open) => {
      if (!open) {
        set({
          stageDesignerOpen: false,
          editingStageLayoutId: null,
          draftStageLayout: null,
          selectedZone: null,
          stageUndoStack: [],
          stageRedoStack: [],
        })
      } else {
        set({ stageDesignerOpen: true })
      }
    },
    startEditingStageLayout: (id) => {
      const layout = get().stageLayouts.find((l) => l.id === id)
      if (!layout) return
      set({
        stageDesignerOpen: true,
        editingStageLayoutId: id,
        draftStageLayout: stageEditing.createStageDraft(layout, Date.now()),
        selectedZone: null,
        stageUndoStack: [],
        stageRedoStack: [],
      })
    },
    pushStageUndo: () => {
      const { draftStageLayout, stageUndoStack } = get()
      if (!draftStageLayout) return
      set({
        stageUndoStack: history.pushSnapshot(stageUndoStack, draftStageLayout),
        stageRedoStack: [],
      })
    },
    setSelectedZone: (selectedZone) => set({ selectedZone }),
    updateStageDraft: (updates) => {
      const now = Date.now()
      if (now - lastStageUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushStageUndo()
        lastStageUndoPush = now
      }
      set((s) => ({
        draftStageLayout: s.draftStageLayout
          ? { ...s.draftStageLayout, ...updates, updatedAt: Date.now() }
          : null,
      }))
      emitStageDraftToOutputs(get())
    },
    updateStageDraftNested: (path, value) => {
      const now = Date.now()
      if (now - lastStageUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushStageUndo()
        lastStageUndoPush = now
      }
      set((s) => ({
        draftStageLayout: s.draftStageLayout
          ? (stageEditing.setNestedValue(
              s.draftStageLayout as unknown as Record<string, unknown>,
              path,
              value
            ) as unknown as StageLayout)
          : null,
      }))
      emitStageDraftToOutputs(get())
    },
    addZone: (source) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      get().pushStageUndo()
      const { draft, selectedId } = stageEditing.addZone(
        draftStageLayout,
        source,
        crypto.randomUUID(),
        Date.now()
      )
      set({ draftStageLayout: draft, selectedZone: selectedId })
      emitStageDraftToOutputs(get())
    },
    removeZone: (id) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      get().pushStageUndo()
      set((s) => ({
        draftStageLayout: stageEditing.removeZone(
          draftStageLayout,
          id,
          Date.now()
        ),
        selectedZone: s.selectedZone === id ? null : s.selectedZone,
      }))
      emitStageDraftToOutputs(get())
    },
    reorderStageLayers: (fromIndex, toIndex) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      get().pushStageUndo()
      set({
        draftStageLayout: stageEditing.reorderLayers(
          draftStageLayout,
          fromIndex,
          toIndex,
          Date.now()
        ),
      })
      emitStageDraftToOutputs(get())
    },
    toggleZoneVisibility: (id) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      set({
        draftStageLayout: stageEditing.toggleZoneVisibility(
          draftStageLayout,
          id
        ),
      })
      emitStageDraftToOutputs(get())
    },
    toggleZoneLocked: (id) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      set({
        draftStageLayout: stageEditing.toggleZoneLocked(draftStageLayout, id),
      })
    },
    duplicateZone: (id) => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      const result = stageEditing.duplicateZone(
        draftStageLayout,
        id,
        crypto.randomUUID(),
        Date.now()
      )
      if (!result) return
      get().pushStageUndo()
      set({ draftStageLayout: result.draft, selectedZone: result.selectedId })
      emitStageDraftToOutputs(get())
    },
    nudgeZone: (dx, dy) => {
      const { draftStageLayout, selectedZone } = get()
      if (!draftStageLayout || !selectedZone) return
      const next = stageEditing.nudgeZone(
        draftStageLayout,
        selectedZone,
        dx,
        dy,
        Date.now()
      )
      if (!next) return
      const now = Date.now()
      if (now - lastStageUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushStageUndo()
        lastStageUndoPush = now
      }
      set({ draftStageLayout: next })
      emitStageDraftToOutputs(get())
    },
    stageUndo: () => {
      const { stageUndoStack, stageRedoStack, draftStageLayout } = get()
      if (!draftStageLayout) return
      const step = history.undo(
        draftStageLayout,
        stageUndoStack,
        stageRedoStack
      )
      if (!step) return
      set({
        stageUndoStack: step.undoStack,
        stageRedoStack: step.redoStack,
        draftStageLayout: step.current,
      })
      emitStageDraftToOutputs(get())
    },
    stageRedo: () => {
      const { stageUndoStack, stageRedoStack, draftStageLayout } = get()
      if (!draftStageLayout) return
      const step = history.redo(
        draftStageLayout,
        stageUndoStack,
        stageRedoStack
      )
      if (!step) return
      set({
        stageUndoStack: step.undoStack,
        stageRedoStack: step.redoStack,
        draftStageLayout: step.current,
      })
      emitStageDraftToOutputs(get())
    },
    saveStageDraft: () => {
      const { draftStageLayout } = get()
      if (!draftStageLayout) return
      if (draftStageLayout.builtin) {
        const custom = stageEditing.promoteBuiltinToCustom(
          draftStageLayout,
          crypto.randomUUID(),
          Date.now()
        )
        set((s) => ({
          stageLayouts: [...s.stageLayouts, custom],
          editingStageLayoutId: custom.id,
          draftStageLayout: custom,
        }))
        get().syncStageOutput()
      } else {
        get().saveStageLayout(draftStageLayout)
      }
    },
    discardStageDraft: () => {
      const { editingStageLayoutId } = get()
      if (editingStageLayoutId)
        get().startEditingStageLayout(editingStageLayoutId)
    },
    setMediaLayer: (mediaLayer) => {
      set({ mediaLayer })
      get().syncMediaLayer()
    },
    toggleMediaLayer: () => {
      set((s) => ({
        mediaLayer: s.mediaLayer
          ? { ...s.mediaLayer, active: !s.mediaLayer.active }
          : null,
      }))
      get().syncMediaLayer()
    },
    syncMediaLayer: () => {
      const s = get()
      const layer = s.mediaLayer
      emitToAllOutputs(s.outputs, "broadcast:media-layer-update", {
        layer: layer?.active ? layer : null,
      })
    },
    addProp: (prop) => {
      set((s) => ({ props: [...s.props, prop] }))
      get().syncProps()
    },
    updateProp: (id, updates) => {
      set((s) => ({
        props: s.props.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }))
      get().syncProps()
    },
    removeProp: (id) => {
      set((s) => ({ props: s.props.filter((p) => p.id !== id) }))
      get().syncProps()
    },
    toggleProp: (id) => {
      set((s) => ({
        props: s.props.map((p) =>
          p.id === id ? { ...p, active: !p.active } : p
        ),
      }))
      get().syncProps()
    },
    syncProps: () => {
      const s = get()
      const props = s.props.filter((p) => p.active)
      emitToAllOutputs(s.outputs, "broadcast:props-update", { props })
    },
    syncBroadcastOutputFor: (outputId: string) => {
      const s = get()
      const output = findOutput(s.outputs, outputId)
      if (!output) return
      const themeId = output.themeId
      const theme = s.themes.find((t) => t.id === themeId) ?? s.themes[0]
      if (!theme) return

      if (!s.isLive) {
        const payload: Record<string, unknown> = { theme, verse: null }
        if (output.contentSource.type === "layer-filter") {
          payload.layerFilter = output.contentSource.layers
        }
        emitToOutput(outputId, "broadcast:verse-update", payload)
        return
      }

      if (s.liveSlide) {
        emitToOutput(outputId, "broadcast:slide-update", { slide: s.liveSlide })
      } else if (s.liveMedia) {
        emitToOutput(outputId, "broadcast:media-update", s.liveMedia)
      } else {
        const payload: Record<string, unknown> = { theme, verse: s.liveVerse }
        if (output.contentSource.type === "layer-filter") {
          payload.layerFilter = output.contentSource.layers
        }
        emitToOutput(outputId, "broadcast:verse-update", payload)
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
    setActiveTheme: (themeId) => {
      set((s) => ({
        outputs: updateOutputInArray(s.outputs, "main", { themeId }),
      }))
      get().syncBroadcastOutputFor("main")
    },
    setAltActiveTheme: (themeId) => {
      set((s) => ({
        outputs: updateOutputInArray(s.outputs, "alt", { themeId }),
      }))
      get().syncBroadcastOutputFor("alt")
    },
    setLive: (isLive) => {
      set({ isLive })
      if (!isLive) {
        // A lock only makes sense while broadcasting: drop it (and any pending
        // stage) when going off-air so the next go-live starts in follow mode.
        set({ liveLocked: false, previewPending: false })
        if (get().liveWeb) closeWebOverlays(get().outputs)
      }
      get().syncBroadcastOutput()
      if (isLive && get().liveWeb) {
        get().syncWebOutput()
      }
    },
    setLiveLocked: (locked) => {
      if (locked) {
        // Engage: preview already mirrors live (unlocked presents write both), so
        // nothing is staged yet — just arm the lock.
        set({ liveLocked: true, previewPending: false })
        return
      }
      // Release: take whatever is staged (if anything) into the live output, then
      // return to follow mode. Clear the lock first so the commit runs unguarded.
      const pending = get().previewPending
      set({ liveLocked: false })
      if (pending) get().takeToLive()
      else set({ previewPending: false })
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
      emitToAllOutputs(get().outputs, "broadcast:mute", {
        muted: broadcastMuted,
      })
      const web = get().liveWeb
      if (web) {
        if (web.isYouTube && web.videoId) {
          // Controllable overlay: mute via the IFrame Player API.
          get().sendWebTransport("mute", { muted: broadcastMuted })
        } else {
          // Plain navigated overlay: fall back to the eval-based mute.
          for (const output of get().outputs) {
            void invoke("mute_web_overlay", {
              outputId: output.id,
              muted: broadcastMuted,
            }).catch(() => {})
          }
        }
      }
    },
    sendMediaTransport: (action, position) => {
      emitToAllOutputs(get().outputs, "broadcast:media-transport", {
        action,
        position,
      })
    },
    setMediaTransport: (mediaTransport) => set({ mediaTransport }),
    sendWebTransport: (action, opts) => {
      emitToAllOverlays(get().outputs, "broadcast:web-transport", {
        action,
        position: opts?.position,
        muted: opts?.muted,
      })
    },
    setWebTransport: (webTransport) => set({ webTransport }),
    setLiveVerse: (verse, source) => {
      // Always stage into the preview (clearing the other preview kinds) so the
      // Program preview shows it. When locked+live we stop there — the audience
      // stays frozen until Take/unlock; otherwise commit straight to live.
      set({
        previewVerse: verse,
        previewSlide: null,
        previewMedia: null,
        previewWeb: null,
        previewSource: source ?? null,
      })
      if (get().liveLocked && get().isLive) {
        set({ previewPending: true })
        return
      }
      commitVerseLive(verse, source)
    },
    setLiveSlide: (slide, source) => {
      set({
        previewSlide: slide,
        previewVerse: null,
        previewMedia: null,
        previewWeb: null,
        previewSource: source ?? null,
      })
      if (get().liveLocked && get().isLive) {
        set({ previewPending: true })
        return
      }
      commitSlideLive(slide, source)
    },
    setLiveMedia: (media, source) => {
      set({
        previewMedia: media,
        previewSlide: null,
        previewVerse: null,
        previewWeb: null,
        previewSource: source ?? null,
      })
      if (get().liveLocked && get().isLive) {
        set({ previewPending: true })
        return
      }
      commitMediaLive(media, source)
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
      emitToAllOutputs(get().outputs, "broadcast:media-fit-update", fit)
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
      })
      if (get().liveLocked && get().isLive) {
        set({ previewPending: true })
        return
      }
      commitWebLive(web, source)
    },
    clearLiveWeb: () => {
      set({ liveWeb: null, previewWeb: null, webTransport: null })
      closeWebOverlays(get().outputs)
    },
    syncWebOutput: () => {
      const s = get()
      if (!s.liveWeb || !s.isLive) return
      const web = s.liveWeb
      // Controllable overlay for YouTube (hosts the IFrame Player API);
      // plain navigation for any other web URL.
      const config =
        web.isYouTube && web.videoId
          ? {
              videoId: web.videoId,
              start: web.startTime,
              end: web.endTime,
              isLive: web.isLive,
              muted: s.broadcastMuted,
            }
          : undefined
      for (const output of s.outputs) {
        let url = web.url
        if (s.broadcastMuted && web.isYouTube && !config) {
          const u = new URL(url)
          u.searchParams.set("mute", "1")
          url = u.toString()
        }
        void invoke("open_web_overlay", {
          outputId: output.id,
          url,
          config,
        }).catch(() => {})
      }
    },

    // Output management
    addOutput: (output) => {
      set((s) => ({ outputs: [...s.outputs, output] }))
    },
    removeOutput: (outputId) => {
      if (outputId === "main") return
      set((s) => ({ outputs: s.outputs.filter((o) => o.id !== outputId) }))
    },
    updateOutput: (outputId, updates) => {
      set((s) => ({
        outputs: updateOutputInArray(s.outputs, outputId, updates),
      }))
      if (
        updates.themeId ||
        updates.mode ||
        updates.contentSource ||
        updates.stageConfig ||
        "stageLayoutId" in updates // present even when cleared to undefined
      ) {
        const output = get().outputs.find((o) => o.id === outputId)
        if (output?.mode === "stage") {
          get().syncStageOutput()
        } else {
          get().syncBroadcastOutputFor(outputId)
        }
      }
    },
    getOutput: (outputId) => findOutput(get().outputs, outputId),
    getOutputThemeId: (outputId) => resolveThemeId(get().outputs, outputId),

    // Stage display
    updateStageConfig: (outputId, updates) => {
      set((s) => ({
        outputs: updateOutputInArray(s.outputs, outputId, {
          stageConfig: {
            ...(s.outputs.find((o) => o.id === outputId)?.stageConfig ??
              DEFAULT_STAGE_DISPLAY_CONFIG),
            ...updates,
          },
        }),
      }))
      get().syncStageOutput()
    },
    setStageNotes: (stageNotes) => {
      set({ stageNotes })
      get().syncStageOutput()
    },
    setStageTimer: (stageTimer) => {
      set({ stageTimer })
      get().syncStageOutput()
    },
    setStageMessage: (stageMessage) => {
      set({ stageMessage })
      get().syncStageOutput()
    },
    setStageAnnouncement: (stageAnnouncement) => {
      set({ stageAnnouncement })
      get().syncStageOutput()
    },
    setStagePlaylist: (stagePlaylist) => {
      set({ stagePlaylist })
      get().syncStageOutput()
    },
    syncStageOutput: () => {
      const s = get()
      const stageOutputs = s.outputs.filter((o) => o.mode === "stage")
      for (const output of stageOutputs) {
        const layout = resolveOutputStageLayout(output, s.stageLayouts)
        const theme =
          s.themes.find((t) => t.id === output.themeId) ?? s.themes[0]
        if (!theme) continue
        emitToOutput(output.id, "broadcast:stage-update", {
          layout,
          currentTheme: theme,
          currentVerse: s.liveVerse,
          currentSlide: s.liveSlide,
          notes: s.stageNotes,
          timer: s.stageTimer,
          message: s.stageMessage,
          announcement: s.stageAnnouncement,
          playlist: s.stagePlaylist,
        })
      }
    },

    // Designer
    setDesignerOpen: (isDesignerOpen) => {
      if (!isDesignerOpen) {
        set({
          isDesignerOpen,
          editingThemeId: null,
          draftTheme: null,
          selectedElement: null,
          undoStack: [],
          redoStack: [],
        })
      } else {
        set({ isDesignerOpen })
      }
    },
    startEditing: (themeId) => {
      const theme = get().themes.find((t) => t.id === themeId)
      if (!theme) return
      set({
        editingThemeId: themeId,
        draftTheme: themeEditing.createDraft(theme, Date.now()),
        selectedElement: null,
        undoStack: [],
        redoStack: [],
      })
    },
    pushUndo: () => {
      const { draftTheme, undoStack } = get()
      if (!draftTheme) return
      set({
        undoStack: history.pushSnapshot(undoStack, draftTheme),
        redoStack: [],
      })
    },
    updateDraft: (updates) => {
      const now = Date.now()
      if (now - lastUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushUndo()
        lastUndoPush = now
      }
      set((s) => ({
        draftTheme: s.draftTheme
          ? { ...s.draftTheme, ...updates, updatedAt: Date.now() }
          : null,
      }))
      emitDraftToBroadcast(get())
    },
    updateDraftNested: (path, value) => {
      const now = Date.now()
      if (now - lastUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushUndo()
        lastUndoPush = now
      }
      set((s) => ({
        draftTheme: s.draftTheme
          ? (themeEditing.setNestedValue(
              s.draftTheme as unknown as Record<string, unknown>,
              path,
              value
            ) as unknown as BroadcastTheme)
          : null,
      }))
      emitDraftToBroadcast(get())
    },
    undo: () => {
      const { undoStack, redoStack, draftTheme } = get()
      if (!draftTheme) return
      const step = history.undo(draftTheme, undoStack, redoStack)
      if (!step) return
      set({
        undoStack: step.undoStack,
        redoStack: step.redoStack,
        draftTheme: step.current,
      })
      emitDraftToBroadcast(get())
    },
    redo: () => {
      const { undoStack, redoStack, draftTheme } = get()
      if (!draftTheme) return
      const step = history.redo(draftTheme, undoStack, redoStack)
      if (!step) return
      set({
        undoStack: step.undoStack,
        redoStack: step.redoStack,
        draftTheme: step.current,
      })
      emitDraftToBroadcast(get())
    },
    saveDraft: () => {
      const { draftTheme } = get()
      if (!draftTheme) return
      if (draftTheme.builtin) {
        const customTheme = themeEditing.promoteBuiltinToCustom(
          draftTheme,
          crypto.randomUUID(),
          Date.now()
        )
        set((s) => ({
          themes: [...s.themes, customTheme],
          outputs: updateOutputInArray(s.outputs, "main", {
            themeId: customTheme.id,
          }),
          editingThemeId: customTheme.id,
          draftTheme: customTheme,
        }))
      } else {
        get().saveTheme(draftTheme)
      }
    },
    discardDraft: () => {
      const { editingThemeId } = get()
      if (editingThemeId) {
        get().startEditing(editingThemeId)
      }
    },
    setSelectedElement: (selectedElement) => set({ selectedElement }),
    toggleRegionLocked: (id) =>
      set((s) => {
        const next = new Set(s.regionLocked)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { regionLocked: next }
      }),
    toggleRegionHidden: (id) =>
      set((s) => {
        const next = new Set(s.regionHidden)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { regionHidden: next }
      }),
    addElement: (type) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      get().pushUndo()
      const { draft, selectedId } = themeEditing.addElement(
        draftTheme,
        type,
        crypto.randomUUID(),
        Date.now()
      )
      set({ draftTheme: draft, selectedElement: selectedId })
      emitDraftToBroadcast(get())
    },
    removeElement: (id) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      get().pushUndo()
      set((s) => ({
        draftTheme: themeEditing.removeElement(draftTheme, id, Date.now()),
        selectedElement: s.selectedElement === id ? null : s.selectedElement,
      }))
      emitDraftToBroadcast(get())
    },
    reorderLayers: (fromIndex, toIndex) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      get().pushUndo()
      set({
        draftTheme: themeEditing.reorderLayers(
          draftTheme,
          fromIndex,
          toIndex,
          Date.now()
        ),
      })
      emitDraftToBroadcast(get())
    },
    toggleElementVisibility: (id) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      set({ draftTheme: themeEditing.toggleElementVisibility(draftTheme, id) })
      emitDraftToBroadcast(get())
    },
    toggleElementLocked: (id) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      set({ draftTheme: themeEditing.toggleElementLocked(draftTheme, id) })
    },
    triggerTransitionPreview: () => {
      set({ transitionPreviewTrigger: Date.now() })
    },
    duplicateElement: (id) => {
      const { draftTheme } = get()
      if (!draftTheme) return
      const result = themeEditing.duplicateElement(
        draftTheme,
        id,
        crypto.randomUUID(),
        Date.now()
      )
      if (!result) return
      get().pushUndo()
      set({ draftTheme: result.draft, selectedElement: result.selectedId })
      emitDraftToBroadcast(get())
    },
    nudgeElement: (dx, dy) => {
      const { draftTheme, selectedElement } = get()
      if (!draftTheme || !selectedElement) return
      const next = themeEditing.nudgeSelection(
        draftTheme,
        selectedElement,
        dx,
        dy,
        Date.now()
      )
      if (!next) return // no-op: unselected region, missing or locked element
      const now = Date.now()
      if (now - lastUndoPush > UNDO_DEBOUNCE_MS) {
        get().pushUndo()
        lastUndoPush = now
      }
      set({ draftTheme: next })
      emitDraftToBroadcast(get())
    },
  }
})

// ── Theme persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getThemeStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("broadcast-themes.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateBroadcastThemes(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getThemeStore()
      const customThemes = (await store.get("customThemes")) as
        BroadcastTheme[] | undefined
      const customStageLayouts = (await store.get("customStageLayouts")) as
        StageLayout[] | undefined
      const savedOutputs = (await store.get("outputs")) as
        BroadcastOutput[] | undefined

      const savedProps = (await store.get("props")) as
        BroadcastProp[] | undefined
      const savedMediaLayer = (await store.get("mediaLayer")) as
        MediaLayerState | undefined
      const savedStageConfig = (await store.get("stageDisplayConfig")) as
        (StageDisplayConfig & { enabled?: boolean }) | undefined

      const patch: Partial<BroadcastState> = {}
      if (
        customThemes &&
        Array.isArray(customThemes) &&
        customThemes.length > 0
      ) {
        patch.themes = [...BUILTIN_THEMES, ...customThemes]
      }

      if (
        customStageLayouts &&
        Array.isArray(customStageLayouts) &&
        customStageLayouts.length > 0
      ) {
        patch.stageLayouts = [
          ...BUILTIN_STAGE_LAYOUTS,
          ...customStageLayouts.map(stageEditing.sanitizeStageLayout),
        ]
      }

      if (
        savedOutputs &&
        Array.isArray(savedOutputs) &&
        savedOutputs.length > 0
      ) {
        patch.outputs = savedOutputs
      } else {
        const activeId = (await store.get("activeThemeId")) as
          string | undefined
        const altActiveId = (await store.get("altActiveThemeId")) as
          string | undefined
        if (activeId || altActiveId) {
          const migrated = DEFAULT_OUTPUTS.map((o) => ({ ...o }))
          if (activeId) {
            const main = migrated.find((o) => o.id === "main")
            if (main) main.themeId = activeId
          }
          if (altActiveId) {
            const alt = migrated.find((o) => o.id === "alt")
            if (alt) alt.themeId = altActiveId
          }
          patch.outputs = migrated
        }
      }

      // Migrate global stageDisplayConfig into per-output stageConfig
      if (savedStageConfig) {
        const { enabled, ...configWithoutEnabled } = savedStageConfig
        const mergedConfig = {
          ...DEFAULT_STAGE_DISPLAY_CONFIG,
          ...configWithoutEnabled,
        }
        const outputs = patch.outputs ?? useBroadcastStore.getState().outputs
        if (enabled) {
          const alt = outputs.find((o) => o.id === "alt")
          if (alt) {
            alt.mode = "stage"
            alt.stageConfig = mergedConfig
          }
        }
        // Check if any stage-mode outputs need a default stageConfig
        for (const o of outputs) {
          if (o.mode === "stage" && !o.stageConfig) {
            o.stageConfig = mergedConfig
          }
        }
        patch.outputs = [...outputs]
        await store.delete("stageDisplayConfig")
      }

      if (savedProps && Array.isArray(savedProps)) patch.props = savedProps
      if (savedMediaLayer) patch.mediaLayer = savedMediaLayer

      if (Object.keys(patch).length > 0) {
        useBroadcastStore.setState(patch)
      }

      // Auto-persist on changes (debounced)
      useBroadcastStore.subscribe((state, prevState) => {
        const changed =
          state.themes !== prevState.themes ||
          state.stageLayouts !== prevState.stageLayouts ||
          state.outputs !== prevState.outputs ||
          state.props !== prevState.props ||
          state.mediaLayer !== prevState.mediaLayer
        if (!changed) return
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          pendingSave = pendingSave.then(() =>
            persistBroadcastThemes(useBroadcastStore.getState())
          )
        }, SAVE_DEBOUNCE_MS)
      })
    } catch {
      console.warn(
        "[broadcast] Failed to load persisted themes, using defaults"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistBroadcastThemes(state: BroadcastState): Promise<void> {
  try {
    const store = await getThemeStore()
    const customThemes = state.themes.filter((t) => !t.builtin)
    const customStageLayouts = state.stageLayouts.filter((l) => !l.builtin)
    await store.set("customThemes", customThemes)
    await store.set("customStageLayouts", customStageLayouts)
    await store.set("outputs", state.outputs)
    await store.set("props", state.props)
    await store.set("mediaLayer", state.mediaLayer)
    await store.delete("activeThemeId")
    await store.delete("altActiveThemeId")
    await store.save()
  } catch {
    console.warn("[broadcast] Failed to persist themes")
  }
}
