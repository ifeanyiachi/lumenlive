# Broadcast-Output Decouple Plan

> Working document. Scratch/planning — **keep untracked, do not commit** (project
> convention: markdown here is planning/scratch).
> Scope: the revised **Wave 3 · S2 · Phases 5–6** of `refactorcode.md` — decouple
> `src/broadcast-output.tsx` (1,456 lines) into readable, independently-modifiable
> files. Goal is cohesive files, **not** a minimal line count.

## Findings: what's actually in the file

The file is **one React component** (`BroadcastCanvas`) plus a `createRoot` entry.
Structurally it fuses five things:

| Region | Lines | What it is |
|--------|-------|------------|
| Imports + config | 1–96 | Window entry, URL-hash config parse (`parseBroadcastConfig`), payload type aliases |
| **48 `useRef`s** | 98–187 | The shared mutable state — an ad-hoc in-component store |
| Core callbacks | 189–504 | `computeSurface`, `readCompositorState`, `draw`, `pushNdiFrame`/`pushNdiBurst`, snapshot helpers, `startTransition`, loop starters |
| **The ~900-line `useEffect`** | 506–1428 | Canvas init, render-loop creation, the media state machine, **22 event listeners**, NDI status fetch, `output-ready`, and one ~60-line cleanup |
| 3 hook calls + JSX | 1430–1456 | `useWindowSurface` / `useStageClock` / `useNdiKeepalive`, then `<canvas>` + `<OutputWebLayer>` |

**The real coupling — and why prior sessions stopped:** every listener mutates some
of the 48 refs, then calls `draw()` (which reads *all* refs via
`readCompositorState`) and `pushNdiBurst()`. `draw`, `pushNdiFrame`,
`startTransition`, and the loop-starters also read those refs. The refs are a
shared spine that ~30 functions touch, so no single listener or "media playback"
can be lifted out in isolation without dragging the spine along. The S2 deferral
note called this the "~40 shared refs" problem; it is real.

**What earlier phases already banked:** all heavy *logic* is out in tested
`lib/broadcast-output/` modules — `compositor`, `transitions`, `asset-cache`,
`ndi-push`, `render-loop`, `surface`, `frame`, `ndi-key`, `config`. What remains in
this file is **pure React/DOM glue**: ref declarations, event wiring, and the
media-element state machine. This is a *relocation* job, not a logic rewrite.

## Strategy: one runtime object

Instead of 40-argument signatures (the trap that made earlier attempts "worse
code"), introduce a single plain object — **`OutputRuntime`** — holding all 48
refs plus the core shared actions (`draw`, `pushNdiFrame`, `pushNdiBurst`,
`renderLoop`, `startTransition`, `computeSurface`, loggers). The component builds
it once; every extracted piece receives that **one** object and reads
`rt.latestSlide.current`, `rt.draw()`, etc.

This turns "40 tangled locals" into "one documented context" — exactly what makes
the resulting files readable and independently modifiable. It is a plain object,
**not React Context** (no re-render machinery, no behavior change).

## Proposed file structure

The entry path can't move (`broadcast-output.html` hardcodes
`/src/broadcast-output.tsx`), so the entry becomes a thin shell and everything else
moves beside it:

```
src/broadcast-output.tsx                      # entry shell: createRoot(<BroadcastCanvas/>)  (~5 lines)
src/components/broadcast-output/
  broadcast-canvas.tsx                        # the component: build runtime, wire hooks, render JSX  (~120 lines)
  runtime.ts                                  # OutputRuntime type + createOutputRuntime(refs) + the shared
                                              #   core actions (computeSurface, readCompositorState, draw,
                                              #   pushNdiFrame/Burst, snapshot*, startTransition)  (~300 lines)
  hooks/
    use-broadcast-events.ts                   # the ex-900-line effect: create render loop, register every
                                              #   listener group, return the combined cleanup  (~120 lines)
    use-media-playback.ts                     # media state machine: emitMediaProgress, runMediaVideoLoop,
                                              #   handleMediaVideoEnd  (~110 lines)
  events/                                     # one registrar per subsystem: (rt) => disposer(s)
    verse-listener.ts
    slide-listener.ts                         # includes transition + slide-anim setup
    media-listeners.ts                        # media-update / media-fit / media-transport (uses use-media-playback)
    overlay-listeners.ts                      # alert×3, countdown×5, props/marquee, media-layer
    visibility-listeners.ts                   # output-visibility, base-theme, mute, stage
    surface-listeners.ts                      # ndi-config, display-config, resync, ndi-status fetch, output-ready
```

Each `events/*.ts` exports a `register…(rt)` returning its disposer(s).
`use-broadcast-events` calls them and aggregates cleanup — so the teardown list
stays exhaustive and in one place.

## Phased plan

**Every phase is a faithful move** — cut, paste, rewire ref access to `rt.*`. No
behavior change permitted. Gate for each phase: `typecheck` 0, `lint` 0, existing
`lib/` + `compositor` tests green, **plus** the manual smoke checklist below (this
glue cannot be unit-tested).

1. **Phase 1 — Runtime object.** Create `runtime.ts`: move all 48 ref declarations
   into `createOutputRuntime()`, and move the core actions (`computeSurface`,
   `readCompositorState`, `draw`, `pushNdiFrame`, `pushNdiBurst`, snapshots,
   `startTransition`) onto/around it. Component calls `const rt = useOutputRuntime()`.
   Biggest mechanical churn, lowest conceptual risk — typecheck catches every
   mis-rewired ref. Ship alone so the diff is reviewable in isolation.

2. **Phase 2 — Media playback hook.** Move `emitMediaProgress` /
   `runMediaVideoLoop` / `handleMediaVideoEnd` into `use-media-playback.ts`, driven
   by `rt`. This is the self-contained state machine the deferral note called out.

3. **Phase 3 — Split the listeners** into the six `events/*.ts` registrars, and
   reduce the giant effect to `use-broadcast-events.ts` (create loop → register
   groups → aggregate cleanup). Do this **in sub-steps by group** (verse, then
   slide, then media, …) so no single diff is a blind 900-line rewrite — the exact
   risk that stopped earlier attempts.

4. **Phase 4 — Thin the shell.** `broadcast-canvas.tsx` ends as: build runtime,
   `useBroadcastEvents(rt)`, the three existing hooks, and JSX. Entry
   `broadcast-output.tsx` becomes the `createRoot` shell.

## Risk & verification

- **No automated safety net is possible for the glue** — it paints a real canvas
  and streams NDI, neither reproducible in the test env. The compositor/loop
  *logic* stays test-covered (already in `lib/`); the *wiring* is verified by
  typecheck + a hands-on smoke test.
- **Smoke checklist (run `npm run tauri`, ideally with an NDI monitor)** — same as
  the S2 Phases 1–4 checklist: open output window + NDI; verse take/clear/black/
  logo; slide take incl. transition + entry animation; media image/video (play/
  pause/seek/trim/end-action); animated verse-theme bg + video base bg; marquee +
  countdown; media layer under transparent content; alt output + custom/NDI
  resolution.
- **Recommendation:** run these phases in a session with live app access, one phase
  per review. Phase 1 (runtime object) is safe to prepare and typecheck even
  without live access, but still smoke-test before calling it done.

## What deliberately stays put

- The **logic lib modules** (compositor, render-loop, ndi-push, etc.) — already
  extracted and tested; untouched.
- The **`OutputWebLayer` / `useYouTubePlayer`** items from S2 Phase 6 — already
  resolved; the doc's rejection of merging them still holds (different windows, no
  shared runtime).
- No "~80-line component" target. Aim is cohesive, individually-openable files.

## Inventory (for the mover)

**48 refs** to relocate into `OutputRuntime` (grouped by concern):

- Canvas / surface: `canvasRef`, `ndiCanvasRef`, `prevCanvasRef`, `windowSizeRef`,
  `displayConfigRef`, `ndiConfigRef`.
- Content snapshots: `latestData`, `latestSlide`, `latestMedia`, `layerFilterRef`,
  `activeMode`, `baseThemeRef`.
- Media elements + transport: `videoRef`, `audioRef`, `videoRafRef`,
  `mediaConfigRef`, `mediaBlankRef`, `mediaKindRef`, `mediaFitRef`.
- Media layer: `mediaLayerRef`, `mediaLayerImgRef`, `mediaLayerVideoRef`.
- Overlays: `activeAlerts`, `activeCountdowns`, `activeProps`, `stageDataRef`,
  `stageClockRafRef`.
- Visibility / logo: `blackoutRef`, `clearForegroundRef`, `showLogoRef`,
  `logoPathRef`, `logoImgRef`.
- Animation / loop: `slideAnimTracker`, `transitionRef`, `renderLoopRef`,
  `drawRef`, `pushNdiFrameRef`.
- Caches: `imageCacheRef`, `videoCacheRef`.
- NDI push bookkeeping: `lastPushRef`, `pushingRef`, `broadcastMutedRef`.

**24 `listenOutputEvent` subscriptions** to relocate into `events/*.ts`:
verse-update, slide-update, media-update, media-fit-update, media-transport,
alert, alert-dismiss, alert-dismiss-all, countdown, countdown-update,
countdown-sync, countdown-dismiss, countdown-dismiss-all, props-update,
media-layer-update, stage-update, mute, output-visibility, base-theme, ndi-config,
display-config, request-resync (+ the `getNdiStatus` fetch and `sendOutputReady`).

**Already-extracted hooks reused as-is:** `useWindowSurface`, `useStageClock`,
`useNdiKeepalive`.
