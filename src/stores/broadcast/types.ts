import type {
  VerseRenderData,
  StageDisplayConfig,
  BroadcastOutput,
  StageLayout,
  ZoneSource,
  StageMonitorGroup,
} from "@/types"
import type {
  OutputDisplayMode,
  BaseBackground,
  BroadcastProp,
  MediaLayerState,
  LiveMedia,
  MediaFitUpdate,
  MediaTransportState,
  WebTransportState,
  LiveWeb,
} from "@/types/broadcast"
import type { StageTimer } from "@/lib/stage-display-renderer"
import type { Slide } from "@/types/slide"

export type BroadcastSource = "schedule" | "queue" | "manual" | null
export type SelectedElement = string | null
export type RegionId = "textArea" | "verse" | "reference"

export interface BroadcastState {
  stageLayouts: StageLayout[]
  outputs: BroadcastOutput[]
  isLive: boolean
  liveVerse: VerseRenderData | null
  /**
   * When a long multi-verse block is paginated, the ordered pages. `liveVerse`
   * points at pages[liveVersePageIndex]. Null when the live verse is a single page.
   */
  liveVersePages: VerseRenderData[] | null
  liveVersePageIndex: number
  liveSlide: Slide | null
  liveMedia: LiveMedia | null
  liveWeb: LiveWeb | null
  /**
   * Staged (preview-only) counterparts of the `live*` fields. Presenting an item
   * always writes these — the Program preview reflects the staged item while the
   * live output windows stay on whatever was last taken. The operator pushes the
   * staged item to the audience via {@link BroadcastState.takeToLive} (the play
   * icon, the Go Live button, or Enter). There is no auto-commit path: nothing
   * reaches the audience without an explicit take.
   */
  previewVerse: VerseRenderData | null
  previewSlide: Slide | null
  previewMedia: LiveMedia | null
  previewWeb: LiveWeb | null
  previewSource: BroadcastSource
  /**
   * True when the staged preview has diverged from what's live (an item was
   * presented but not yet taken). Gates {@link BroadcastState.takeToLive} so a
   * take never needlessly re-commits — and thus restarts — the already-live item.
   */
  previewPending: boolean
  mediaTransport: MediaTransportState | null
  webTransport: WebTransportState | null
  broadcastSource: BroadcastSource
  interlinearText: string | null
  broadcastMuted: boolean
  /**
   * Live-output visibility toggles (Black / Clear). Ephemeral —
   * deliberately NOT persisted, so the audience screen is never mysteriously
   * blacked or cleared after a restart. `blackout` cuts the whole output to
   * black; `clearForeground` hides the scripture/slide text while keeping the
   * background/media. Black wins when both are on.
   */
  blackout: boolean
  clearForeground: boolean
  /** Show the holding-logo image on the audience output. Ephemeral (not persisted). */
  showLogo: boolean

  mediaLayer: MediaLayerState | null
  /** Path to the holding-logo image, persisted. Null = no logo configured. */
  logoImagePath: string | null
  /**
   * Central base background, persisted. A theme (with branding) or a bare
   * background (solid/gradient/image/video). Revealed on Clear and shown behind
   * transparent content. Null = each output uses its own theme (the default).
   */
  baseBackground: BaseBackground | null
  props: BroadcastProp[]

  stageNotes: string | null
  // Live source feeds for stage zones (Phase 4).
  stageTimer: StageTimer | null
  /**
   * Per-monitor stage cues, keyed by output id. Each stage monitor can show its
   * own message/announcement (or none), so the operator can target one screen,
   * a named group, or all of them. Absent key ⇒ no cue on that monitor.
   * Ephemeral live state — not persisted (a cue shouldn't survive a restart).
   */
  stageMessages: Record<string, string | null>
  stageAnnouncements: Record<string, string | null>
  /** Named sets of stage monitors for one-tap cue targeting; persisted. */
  stageMonitorGroups: StageMonitorGroup[]
  stagePlaylist: string[] | null

  isDesignerOpen: boolean

  // Stage Layout designer (draft editing — stage-side sibling of the theme draft)
  stageDesignerOpen: boolean
  editingStageLayoutId: string | null
  draftStageLayout: StageLayout | null
  /**
   * True while the draft is a brand-new layout that has not yet been persisted
   * to `stageLayouts`. "New" builds an in-memory draft only; the layout is
   * inserted into the library on the first save.
   */
  isNewStageDraft: boolean
  selectedZone: string | null
  stageUndoStack: StageLayout[]
  stageRedoStack: StageLayout[]

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
  /** Toggle the full black-screen cut on every live output (and the NDI feed). */
  toggleBlackout: () => void
  /** Toggle hiding the foreground text (scripture/slide) on every live output. */
  toggleClearForeground: () => void
  /** Set (or clear, with null) the persisted holding-logo image path. */
  setLogoImage: (path: string | null) => void
  /** Toggle the holding logo on the audience output. No-op if none configured. */
  toggleLogo: () => void
  /** Set (or clear, with null) the global base/master theme override. */
  setBaseBackground: (bg: BaseBackground | null) => void
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
  // Per-output display/surface settings. Each pushes the change to that output's
  // live window immediately (see `outputDisplayConfig` / `broadcast:display-config`).
  setOutputDisplayMode: (outputId: string, mode: OutputDisplayMode) => void
  setOutputCustomResolution: (
    outputId: string,
    resolution: { width: number; height: number }
  ) => void
  setOutputCustomFit: (outputId: string, fit: "contain" | "cover") => void
  setVerseAutoFit: (outputId: string, enabled: boolean) => void
  setMaxVerseScale: (outputId: string, scale: number) => void
  setMinVerseFontSize: (outputId: string, size: number) => void
  setPaginateLongVerses: (outputId: string, enabled: boolean) => void
  /** Step a paginated live verse; returns false when there is no further page. */
  nextVersePage: () => boolean
  prevVersePage: () => boolean
  getOutput: (outputId: string) => BroadcastOutput | undefined
  getOutputThemeId: (outputId: string) => string

  // Stage display
  updateStageConfig: (
    outputId: string,
    updates: Partial<StageDisplayConfig>
  ) => void
  setStageNotes: (notes: string | null) => void
  setStageTimer: (timer: StageTimer | null) => void
  /** Set (or clear, with nulls) the message + announcement on the given monitors. */
  setStageCue: (
    outputIds: string[],
    message: string | null,
    announcement: string | null
  ) => void
  /** Remove both cues from the given monitors. */
  clearStageCue: (outputIds: string[]) => void
  /** Create a named monitor group; returns its generated id. */
  addStageMonitorGroup: (name: string, outputIds: string[]) => string
  updateStageMonitorGroup: (
    id: string,
    patch: Partial<Omit<StageMonitorGroup, "id">>
  ) => void
  removeStageMonitorGroup: (id: string) => void
  setStagePlaylist: (playlist: string[] | null) => void
  syncStageOutput: () => void

  // The Theme Designer open flag (authoring moved to the typed Theme store).
  setDesignerOpen: (open: boolean) => void
}
