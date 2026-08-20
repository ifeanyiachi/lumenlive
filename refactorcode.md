# LumenLive — Refactor Plan

> Working document. Scratch/planning — keep untracked, do not commit.
> Generated from an architecture review of the frontend (React/TS/Zustand) and
> Rust backend. Every issue below carries a phased implementation plan and an
> explicit verification gate.

## How to read this

- Each issue has an **ID** (`S`=structural, `D`=duplication, `P`=performance,
  `R`=Rust/backend, `Q`=quick win), a severity, the evidence, and a phased plan.
- **The gate for every phase** (from `CLAUDE.md`): `npm run typecheck && npm run
  lint && npm test` all clean. Output-preserving refactors (renderers, extractions)
  must ship a **parity test** proving byte-identical output before/after.
- Phases are ordered so each builds on the last. Do not start a slice-level phase
  before its enabling seam exists.

## Architecture baseline (the model we are preserving)

Layering is one-way and must stay that way:

```
components/  → stores/  → lib/ + services/  → types/
```

Two-window app: **main/control** window (all stores, operator previews) and
**output** window(s) (`broadcast-output.tsx`, canvas + NDI feed). The "go live"
flow is **stage-then-take**: `present*()` writes only `preview*` fields;
`takeToLive()` commits to `live*` and emits `broadcast:*` events to the output
window. Strengths to protect: pure `lib/` logic (80 tests / 123 modules), shared
`renderVerse`/`renderSlide` core (~30 call sites).

---

# Execution roadmap (recommended order)

| Wave | Theme | Issues | Risk |
|------|-------|--------|------|
| 0 | Quick wins / safety | Q1 ✅, D5 ✅, D6 ✅ | Very low — **DONE** |
| 1 | Create the missing seam | S3, D7 | Low (mechanical) — ✅ **DONE (all 6 phases)** |
| 2 | Extract types out of god modules | S4, S5 | Low (compiler-verified) — ✅ **DONE** |
| 3 | Slice the two god files | S1, S2 | Medium (parity tests) |
| 4 | Collapse UI duplication | D1 ✅, D2 ✅, D3 ✅, D4 ✅ | Medium — **DONE** |
| 5 | Performance cleanup | P1, P2, P3, P4 | Medium |
| 6 | Rust backend split | R1, R2, R3 | Medium (independent) |
| 7 | Long-tail component decomposition | S7, S8 | Low-medium |

Waves 0–2 are prerequisites and should land first; 3–5 depend on them; 6 is
independent of the frontend and can run in parallel.

---

# WAVE 0 — Quick wins / safety

## Q1 — `[TEMP screenshot patch]` live in the boot path
- **Severity:** High (correctness / release safety)
- **Evidence:** `src/main.tsx:56-99` — comment `[TEMP screenshot patch] … Revert
  before commit`. Races all store hydration against a 1500ms timeout so React
  mounts even if hydration never settles; production boot can render before data
  is loaded.
- **Plan (single phase):**
  1. Restore the original boot: `await Promise.all([...hydrations])` then mount,
     without the `Promise.race` / `bootTimeout`.
  2. If a browser-without-Tauri fallback is genuinely wanted for screenshots, gate
     it behind an explicit dev-only env flag (`import.meta.env.DEV` +
     `!isTauri`) instead of a blanket timeout, and comment it as intentional.
  3. Confirm cold boot still hydrates correctly in the desktop shell (`npm run tauri`).
- **Gate:** typecheck + lint + test; manual boot smoke.

## D5 — `safeFileSrc` wrapper adopted in only 2 of ~19 sites
- **Severity:** Medium (known media/CSP `asset.localhost` foot-gun)
- **Evidence:** `lib/media/safe-file-src.ts` exists but raw `convertFileSrc(...)`
  is called in **17** sites vs **2** wrapper usages.
- **Plan:**
  1. **Phase 1 — harden the wrapper.** Ensure `safeFileSrc` centralizes the
     `asset.localhost`/CSP handling (see memory: prod-only media bug). Add tests
     for edge inputs (empty, already-URL, spaces).
  2. **Phase 2 — codemod call sites.** Replace direct `convertFileSrc` imports
     with `safeFileSrc` across the 17 files. Add an ESLint `no-restricted-imports`
     rule banning `convertFileSrc` outside `safe-file-src.ts`.
  3. **Phase 3 — verify prod build** renders file media (the dev build hides this
     class of bug).
- **Gate:** typecheck + lint + test; **prod build** media smoke.

## D6 — Inline `outputs.find(o => o.id === "main")` instead of selectors
- **Severity:** Low
- **Evidence:** `preview-panel.tsx:306/310`, `live-output-panel.tsx:971/973`,
  `use-broadcast.ts:250` — selectors `findOutput`/`getOutput` already exist in
  `lib/broadcast/output-selectors`.
- **Plan (single phase):** Replace each inline `find` + theme-resolution with the
  existing selectors. Add ESLint guidance / grep check to catch reintroduction.
- **Gate:** typecheck + lint + test.

---

# WAVE 1 — Create the missing seam

## S3 + D7 — No content/event gateway; cross-window contract shares nothing
- **Severity:** High (CLAUDE.md violation + drift risk)
- **Evidence:**
  - 87 `"broadcast:*"` string literals across 11 files; events emitted **directly
    from stores** (`broadcast-store.ts` ~20 sites, `alert-store.ts`,
    `countdown-store.ts`) via `emitToOutput`, bypassing the gateway rule.
  - Payload types (`BroadcastPayload`, `SlidePayload`, `MediaPayload`, …) defined
    **only** in `broadcast-output.tsx`; emit side and listen side share **neither
    event-name constants nor payload types**. A payload shape change won't fail
    compilation on the other side.
- **Plan:**
  1. ✅ **Phase 1 — shared contract types.** DONE. Moved `BroadcastProp` +
     `MediaLayerState` out of `broadcast-store` into `types/broadcast.ts`
     (re-exported from the store for back-compat; lib importers repointed to
     `types/`). NOTE: the remaining payload interfaces live in the gateway module
     (services), **not** `types/broadcast-events.ts` — several reference lib-layer
     types (`StageDisplayData`, `MediaFitPayload`, `Surface`) and a pure `types/`
     module may not import from `lib/` without inverting the layer arrow.
  2. ✅ **Phase 2 — event-name registry.** DONE. `BROADCAST_EVENTS` const map in
     the gateway (all 24 forward + 4 reverse names).
  3. ✅ **Phase 3 — create `services/broadcast-content-gateway.ts`.** DONE. Typed
     `OutputEventPayloads`/`MainEventPayloads` maps; typed `emitOutputEvent`
     (single) + `broadcastOutputEvent` (all) wrapping `emitToOutput`/
     `emitToAllOutputs`; `subscribeOutputEvents(handlers)`/`subscribeMainEvents`
     with race-safe disposers; reverse emitters (`emitMediaProgress`,
     `emitMediaEnded`, `emitWebProgress`, `emitOutputReady`). Colocated test (12
     cases). Compiler now enforces both ends.
     **⏸ PAUSED HERE per instruction — emit/listen migration (phases 4–6) awaits approval.**
  4. ✅ **Phase 4 — migrate emit side.** DONE. `broadcast-store` (20 sites),
     `alert-store` (3), `countdown-store` (5) now use `emitOutputEvent` /
     `broadcastOutputEvent` + `BROADCAST_EVENTS`; raw `broadcast-routing` import
     removed from all three. Typecheck confirmed every emit payload matches the
     contract (zero mismatches).
  5. ✅ **Phase 5 — migrate listen side.** DONE. `broadcast-output.tsx` (22
     listeners) and `output-web-layer.tsx` (3) now use the typed
     `listenOutputEvent(BROADCAST_EVENTS.x, handler)` (1:1 swap — chosen over the
     batch `subscribeOutputEvents` because the handlers are scattered through an
     980-line effect and the file has no test coverage, making a consolidation
     rewrite high-risk). Duplicate local payload interfaces removed (aliased to /
     inferred from the gateway contract). NOTE: the ESLint guard is **deferred to
     Phase 6** — a blanket `emitTo`/`listen` ban would break the not-yet-migrated
     reverse emits AND unrelated legacy hooks (remote-control/transcription/
     file-drop); the clean enforceable guard (ban `@/lib/broadcast-routing`
     imports outside the gateway) lands with Phase 6.
  6. ✅ **Phase 6 — reverse channel + resync + guard.** DONE. Reverse emits in
     `broadcast-output.tsx` (media-progress, media-ended ×2, output-ready ×2) and
     `output-web-layer.tsx` (web-progress) now use the gateway emitters
     (`emitMediaProgress`/`emitMediaEnded`/`emitOutputReady`/`emitWebProgress`);
     main-side listeners in `live-output-panel.tsx` use
     `useTauriEvent(BROADCAST_EVENTS.x, …)` with gateway payload types (kept the
     hook idiom rather than forcing `subscribeMainEvents`, which stays for the
     Wave 3 rewrite). `request-resync`/`output-ready` (broadcast-window-gateway)
     and `ndi-config` (ndi-gateway) folded onto `BROADCAST_EVENTS`. ESLint
     `no-restricted-imports` now bans `emitToOutput`/`emitToAllOutputs` from
     `@/lib/broadcast-routing` outside the content gateway (guard verified to
     fire). **Zero raw `broadcast:` strings remain outside the gateway.**
- **Gate per phase:** typecheck + lint + test; gateway gets a colocated
  `*.test.ts` (canonical gateway shape). End-to-end: open output window, present +
  take, confirm content appears and media progress echoes back.
- **Why first:** this seam is the enabler for slicing `broadcast-store` and
  `broadcast-output` (Wave 3) and for de-duplicating overlays (Wave 4).

---

# WAVE 2 — Extract types out of god modules

## S5 — Domain types defined inside `broadcast-store.ts` — ✅ DONE
- **Status:** DONE (Wave 2). `LiveMedia`, `MediaFitUpdate`, `MediaTransportState`,
  `WebTransportState`, `LiveWeb` moved to `types/broadcast.ts` (joining
  `BroadcastProp`/`MediaLayerState` from Wave 1); all re-exported from the store
  for back-compat. The now-unused `@/types/schedule` import was dropped from the
  store. `BroadcastSource`/`SelectedElement`/`RegionId`/`webPresentNonce` stay
  (store-internal). Gate green.
- **Severity:** Medium
- **Evidence:** `broadcast-store.ts:45-179` defines `BroadcastProp`, `LiveMedia`,
  `MediaFitUpdate`, `MediaTransportState`, `WebTransportState`, `MediaLayerState`,
  `LiveWeb`, `BroadcastSource`, etc.
- **Plan:**
  1. **Phase 1** — move the interfaces to `src/types/broadcast.ts` (extend
     existing). Keep `webPresentNonce` (module-mutable) with the store.
  2. **Phase 2** — update imports across the app; the store imports its own types
     from `@/types` like everything else.
- **Gate:** typecheck + lint + test (pure move, compiler-verified).

## S4 — `types/slide.ts` is ~70% non-type code — ✅ DONE (with a scoping note)
- **Status:** DONE (Wave 2). `types/slide.ts` went **1656 → 240 lines of pure
  types**. Extracted: factories → `lib/slide-defaults.ts` (133 lines); theme data
  + `makeAnimatedSongTheme` + `ANIMATED_SONG_THEMES` + `BUILTIN_SLIDE_THEMES` →
  `lib/slide-themes.ts` (1250 lines); `migrateSlideElements` →
  `lib/slide-migration.ts` (56 lines, with a new colocated test — it was
  previously untested in the types file). All ~15 runtime-symbol importers
  repointed (type-only importers stayed on the `@/types/slide` barrel). Gate green
  (101 files / 875 tests).
  **Scoping note / deviation:** Phase 1 (splitting the remaining pure types into
  `slide-element.ts`/`slide-background.ts`/`slide-theme.ts` sub-modules) was
  **skipped as low-value** — the mandate is "the types file should be pure types,"
  which the runtime extraction already achieves; a 240-line pure-types module does
  not benefit from further splitting, and the barrel-split would add churn to
  ~40 type-only importers for no real gain. Revisit only if the file grows again.
- **Severity:** Medium
- **Evidence:** `types/slide.ts` 1656 lines: `BUILTIN_SLIDE_THEMES` (~1090 lines,
  L516-1605), factories `createDefault*` (L204-333, use `crypto.randomUUID`),
  `makeAnimatedSongTheme` (L368-420), `migrateSlideElements` (L1611-1656).
- **Plan:**
  1. **Phase 1 — split pure types** into `types/slide-element.ts`,
     `types/slide-background.ts`, `types/slide-theme.ts`; keep `types/slide.ts` as
     a slim barrel re-exporting them (existing pattern for canvas types).
  2. **Phase 2 — relocate data** `BUILTIN_SLIDE_THEMES` + `ANIMATED_SONG_THEMES`
     + `makeAnimatedSongTheme` → `lib/slide-themes.ts`.
  3. **Phase 3 — relocate logic** factories → `lib/slide-defaults.ts`;
     `migrateSlideElements` → `lib/slide-migration.ts`. Add tests for factories
     (id/date determinism seams) and migration (legacy-field coercion grid).
  4. **Phase 4** — update imports; `types/slide.ts` ends ~250 lines of pure types.
- **Gate per phase:** typecheck + lint + test; **new tests required** for the
  relocated factory + migration logic (was previously untested in a types file).

---

# WAVE 3 — Slice the two god files

## Wave 3 scope (refreshed after Waves 0–2)

**Current state (measured):**
| File | Lines now | Actions/effects | Existing test coverage | Prereqs |
|------|-----------|-----------------|------------------------|---------|
| `stores/broadcast-store.ts` | **1948** (was 2058) | ~216 method signatures; `BroadcastState` interface from L117 | **`broadcast-store.test.ts` = 858 lines** (substantial) | Wave 1 gateway ✅, Wave 2 types ✅ |
| `broadcast-output.tsx` | **1875** (was 1936) | 4 `useEffect` (one ~900+ lines), **47 refs**, **9 RAF loop refs** (video, slideVideo, mediaLayer, slideAnim, marquee, countdown, themeAnim, baseVideo, stageClock) | **none direct** (only `lib/broadcast-output/*` helpers tested) | Wave 1 gateway ✅ |

**The decisive difference between S1 and S2 is the safety net:**
- **S1 already has an 858-line store test.** The public surface is largely
  covered, so the slice can proceed with a *net already in place* — Phase 1 becomes
  an **audit + gap-fill**, not a from-scratch harness. Risk: **medium-low.**
- **S2 has zero direct tests** on a file that drives the audience projector + NDI
  feed. A **golden-frame harness must be built first** and is the gate for
  everything after. Risk: **medium-high.**

**Both prerequisites are satisfied:** the typed gateway seam (Wave 1) already
centralized all emit/listen, and the leaner types (Wave 2) are in place — so both
slices now happen behind a stable contract.

**Sequencing recommendation:** **S1 first** (bigger structural liability, has a
test net, lower risk), then **S2** (gated on its golden-frame harness). They touch
different files and could parallelize, but sequential keeps each reviewable and
avoids two high-churn diffs landing at once.

**Behavioral-risk hotspots to isolate into their own phases:**
- S1: undo/redo **debounce timing** (`UNDO_DEBOUNCE_MS`) and **persistence
  migration** — both must stay byte-identical; the Zustand slice pattern must keep
  the **flat state shape** (composed slices merge into one object) so selectors and
  persisted JSON are unchanged.
- S2: the **9→1 RAF coalescing** (Phase 4) is the one genuinely behavior-affecting
  change (frame timing / NDI push cadence) — do it isolated, with before/after
  frame-count + push-rate measurement, separate from the pure relocations.

**Effort:** S1 ≈ 5 phases, each a reviewable PR-sized step. S2 ≈ 6 phases,
harness-gated. Wave 3 is the largest wave; expect it to span several sessions.

---

## S1 — `broadcast-store.ts` god object (now 1948 lines, ~216 method sigs)
- **Severity:** Highest (single biggest structural liability)
- **Evidence:** one `create()` fusing live content, preview staging, theme
  designer + undo stack, stage-layout designer + undo stack, output management,
  props, media/web transports, visibility (black/clear/logo), base background,
  stage cues, and persistence. Duplicated "reset live fields" object ×4
  (commit{Verse,Slide,Media,Web}Live). Duplicated designer machinery (theme vs
  stage) and CRUD (theme vs stage-layout). Module-global mutables
  (`lastUndoPush`, `lastStageUndoPush`, persistence handles).
- **Plan (Wave 1 + S5 prereqs satisfied):**
  1. ✅ **Phase 1 — parity harness AUDIT + gap-fill. DONE.**
     **Audit result — already covered** by the 858-line test: go-live commit
     (takeToLive, staging while live/off-air, off-air clears pending, media-by-ref),
     sync/emit, blackout/logo/clear mutual-exclusion, base-theme resolution,
     layer-filter + mirror routing, theme designer basic ops (add/remove/duplicate/
     nudge + undo/redo), theme CRUD (setDefault/delete-fallback/save-fork),
     followManualSelection, stage monitor targeting/cues/groups, web output routing.
     **Gaps found → FILLED (+4 tests):** stage-layout designer undo/redo
     (`addZone` undo/redo + `discardStageDraft` revert) and verse pagination
     stepping (`next`/`prevVersePage` bounds + single-page no-op).
     **Gaps found → still OPEN (fill in the phase that touches them, NOT now):**
     - **Persistence hydrate/migrate** (`hydrateBroadcastThemes` + inline migration:
       legacy `baseThemeId`/`activeThemeId` → outputs, global `stageDisplayConfig`
       → per-output). Untested; needs a `@tauri-apps/plugin-store` mock. **Cover
       before Phase 2's persistence extraction** — highest-priority remaining gap.
     - **Undo debounce** (`UNDO_DEBOUNCE_MS` coalescing of rapid gestures into one
       snapshot). Needs fake timers. **Cover before Phase 3** (`createDesignerSlice`
       must preserve it).
     - **Stage-layout CRUD** (`saveStageLayout`/delete/duplicate/rename/togglePin).
       **Cover before Phase 3** (`createCrudSlice`).
     - **`commitVerseLive` page-building** (the `paginateVerse` orchestration, as
       opposed to the stepping now covered) is hard to test deterministically in
       jsdom (canvas `measureText`); accept as a known limitation / verify manually.
  2. ✅ **Phase 2 — extract pure lib helpers** (no state-shape change) — DONE.
     Store 1948 → **1831 lines**; all 6 helpers extracted with colocated tests;
     107 files / 901 tests green. `output-emit` was scoped down (see note below).
     - **Gating test DONE:** added `broadcast-store.test.ts` persistence/migrate
       coverage (+6: legacy activeThemeId/altActiveThemeId→outputs, global
       stageDisplayConfig→alt stage mode, legacy baseThemeId→base-background,
       new-shape-wins, empty-store no-op, stale defaultThemeId dropped) using an
       in-memory `@tauri-apps/plugin-store` mock. Closes the top open gap so the
       persistence extraction below is safe.
     - ✅ `lib/broadcast/live-reset.ts` — `clearedLiveFields()` factory + test;
       all 4 `commit*Live` helpers now spread it (×4 duplication killed).
     - ✅ `lib/broadcast/pagination-commit.ts` — `resolveVersePages()` (+ test);
       `commitVerseLive` delegates; removed the now-unused `paginateVerse` import.
     - ✅ `lib/broadcast/output-emit.ts` — `resolveLayerFilter()` (+ test), applied
       at both layer-filter sites (`syncBroadcastOutputFor` + `emitDraftToBroadcast`).
       **Scope note:** the fuller `resolveOutputContentEvent` extraction was
       reverted — a correlated (event, payload) union can't be passed to the typed
       `emitOutputEvent` without a verbose dispatch switch that negates the win, and
       the content branch already reads cleanly. Extracted only the genuine 2-site
       dedup.
     - ✅ `lib/stage-layout/stage-payload.ts` — `buildStageUpdatePayload()` (+ test);
       both stage emitters (`syncStageOutput` + `emitStageDraftToOutputs`) share it
       (×2 payload literal killed).
     - ✅ `lib/broadcast/web-payload.ts` — `toWebContentPayload()` (+ test);
       `syncWebOutput` delegates.
     - ✅ `lib/broadcast/persistence.ts` — `buildHydrationPatch()` pure migration
       (+ direct test incl. a no-mutation guarantee); the store's `hydrate` now just
       does I/O (read raw → delegate → apply patch → delete legacy key). Verified
       byte-identical by the 6 gating tests.
  3. **Phase 3 — dedup via pure lib helpers** — ✅ DONE (scoped-lib approach,
     chosen over a full generic slice):
     - ✅ **Gap tests landed first:** undo-debounce coalescing (theme designer,
       fake-timer controlled — rapid edits = 1 snapshot, spaced edits = 2) and
       stage-layout CRUD (save-upsert / rename / pin / duplicate / delete +
       built-in protection). The behaviour the extraction had to preserve was
       pinned before any code moved.
     - ✅ **`lib/broadcast/undo-debounce.ts`** — `createUndoDebouncer(ms)` returns
       a gate owning its own timestamp. Replaced the two mutable module globals
       (`lastUndoPush` / `lastStageUndoPush`) and the **6** copy-pasted
       `if (now - last > 300) {...}` blocks with `themeUndoDebounce` /
       `stageUndoDebounce`. Colocated test (6 cases).
     - ✅ **`lib/broadcast/library-crud.ts`** — pure `upsertById` /
       `removeCustomById` / `duplicateItem` / `renameCustom` / `togglePinById`
       over the shared `LibraryItem` shape. Both theme CRUD (5 actions) and
       stage-layout CRUD (5 actions) now delegate; the store keeps its own
       side-effects (`defaultThemeId` reset on theme-delete, `syncStageOutput` on
       stage-save, `draftTheme` patch on theme-rename). Colocated test (10 cases).
     - ⏹ **`createDesignerSlice<T>` / `createCrudSlice` generics — deliberately
       NOT built.** Decision: the designers diverge in public field names
       (`draftTheme`/`selectedElement` vs `draftStageLayout`/`selectedZone`, read
       directly by many components), lib modules (element vs zone), and
       side-effects. A generic that unified public state would carry a large
       component blast radius and obscure currently-readable code for little gain.
       The genuine, low-risk duplication (debounce + CRUD array transforms) is now
       extracted; the parallel designer *actions* stay explicit by design.
  4. **Phase 4 — split into Zustand slices** under `stores/broadcast/` — ✅ DONE.
     The 1831-line monolith is now a **181-line composition root** + 10 files:
     `types.ts` (301, the `BroadcastState` interface), `internals.ts` (150, shared
     emit helpers + `DEFAULT_OUTPUTS`), and 9 slice creators —
     `theme-crud` (108), `theme-designer` (270), `stage-crud` (91),
     `stage-designer` (249), `outputs` (148), `live-transport` (376),
     `media-props` (82), `stage-display` (116), `sync` (135). Each is a
     `StateCreator<BroadcastState, [], [], XSlice>` composed via spread into a
     single `create<BroadcastState>()((...a) => ({ ...createXSlice(...a) }))`, so
     every slice shares one `set`/`get` and cross-slice `get().syncX()` calls
     resolve exactly as before. Public surface (`useBroadcastStore`,
     `hydrateBroadcastThemes`, re-exported live-content types + `BroadcastSource`)
     is unchanged — no consumer imports changed. All 921 tests (incl. the 47 store
     tests) green with **zero test changes** — proof the split is behavior-neutral.
     The two undo debouncers now live in their respective designer slices
     (module-scoped, still independent).
  5. **Phase 5 — centralize transport** — ✅ DONE (audit, zero code changes).
     Enumerated every `emitOutputEvent`/`broadcastOutputEvent` across the store
     and confirmed the single-seam invariant holds: the core content events
     (`verseUpdate`/`slideUpdate`/`mediaUpdate`/`baseTheme`/`stageUpdate`) are
     emitted ONLY from `sync.ts` and the two designer-draft-preview helpers in
     `internals.ts` (`emitDraftToBroadcast`/`emitStageDraftToOutputs`, which must
     be distinct from the saved-content seam). All other direct emits are
     non-content channels with a clear reason to bypass: `mediaFitUpdate`
     (fit-only, must not restart playback), `mute`/`mediaTransport`/`webTransport`
     (transport), `syncWebOutput` (its own named web seam), `syncMediaLayer` /
     `syncProps` (independent overlay layers), `pushDisplayConfig`/`emitVisibility`
     (config/visibility, also re-sent by the seam for new windows), and the
     `countdown*`/`alert*` events from their own overlay stores. No content resync
     bypasses the seam. **S1 COMPLETE.**
- **Gate per phase:** typecheck + lint + test; **parity tests from Phase 1 must
  stay green** at every step. No behavioral change permitted.
- **S1 STATUS: ✅ COMPLETE** (all 5 phases). `broadcast-store.ts` monolith
  (2058→ a 181-line composition root + 11 focused files under `stores/broadcast/`);
  duplication extracted to tested `lib/` helpers; single emission seam verified.
  Final gate: typecheck 0 / lint 0 / **921 tests green**.

## S2 — `broadcast-output.tsx` (now 1875 lines) single component
- **Severity:** High — **and the only Wave-3 file with no direct test coverage.**
- **Evidence:** **47 refs** acting as an ad-hoc store; one ~900-line `useEffect`
  holding the event wiring + a large cleanup; **9 hand-managed RAF loops** (video,
  slideVideo, mediaLayer, slideAnim, marquee, countdown, themeAnim, baseVideo,
  stageClock); `draw()` god-function (5-way branch); transparent-compositing rule
  spelled out 2× in `draw` and again in NDI paths; media-element lifecycle
  repeated ×4. NOTE: the ~25 inbound listeners are now typed `listenOutputEvent`
  gateway subscriptions (Wave 1) — the IPC is already centralized, so S2 is now
  purely a *rendering/loop/hook* decomposition, not an IPC migration.
- **Plan (Wave 1 prereq satisfied):**
  1. ✅ **Phase 1 — golden-frame harness (GATE — build first). DONE.**
     Since the test env has no real canvas (all draw tests use a recording-ctx
     op-signature, not pixels), "golden frame" = the exact ordered sequence of
     drawing ops the compositor issues for a given state (same state ⇒ same ops ⇒
     same pixels). To have a testable subject, the two compositor entry points were
     extracted **verbatim** out of `broadcast-output.tsx` into a pure
     `lib/broadcast-output/compositor.ts`:
     - `composeFrame(ctx, sw, sh, state)` — the opaque program frame (stage / clear
       / media / slide / verse, then overlays → logo → blackout).
     - `composeNdiForeground(ctx, sw, sh, state)` — the see-through (keyable) NDI
       foreground (content + overlays on a transparent canvas).
     Both are pure over a new `CompositorState` snapshot (no refs, no DOM, injected
     `frameTime`/`now`). The component now builds that snapshot in one
     `readCompositorState()` callback and its `draw`/`drawNdiForeground` shrank to
     thin wrappers; the six inline paint callbacks (`drawMediaSource/Layer/
     BaseTheme` + the three overlay callbacks) and their imports were removed.
     Canvas sizing (`objectFit`/`width`/`height`, identical in every old branch)
     was hoisted once into `draw` before the hand-off — byte-identical.
     **The net:** `compositor.test.ts` (22 cases) stubs every sub-renderer to a
     single labeled marker, so it locks the COMPOSITOR's own contract — branch
     selection, black floor, media-layer/base-theme compositing, overlay order,
     layer-filter gating, and the logo/blackout finishers — independent of
     sub-renderer internals. Gate green: typecheck 0 / lint 0 / **943 tests**.
     **NOTE / deviation:** Phase 1 legitimately created `compositor.ts` (the plan
     had it under Phase 2) because a golden net needs a callable subject — you
     cannot lock an inline `draw()`. The monolithic verbatim extraction + rewire is
     the seam; Phase 2 is now **pure internal decomposition** of `composeFrame`.
  2. ✅ **Phase 2 — compositor decomposition. DONE.** Pure internal refactor of
     `compositor.ts` (no signature/behavior change): the monolithic `composeFrame`
     is now a thin dispatcher over one function per content branch —
     `renderStage/Clear/Media/SlideContent/VerseContent` — plus shared finishers
     `paintOverlays` + `paintLogoAndBlackout`. The transparent-compositing rule
     ("black floor + media layer") is centralized in **`paintProgramBase`** (used
     by clear / media / transparent-slide / verse), and the render-option
     construction shared by the program frame and the keyed NDI foreground is
     centralized in **`buildSlideRenderOpts`/`buildVerseRenderOpts`**; `paintOverlays`
     is now shared 1:1 by `composeFrame` and `composeNdiForeground` (killing the
     duplicated overlay-gating block). Proven byte-identical by the Phase-1 op-
     signature net — **all 22 `compositor.test.ts` cases green with zero test
     changes**. Gate: typecheck 0 / lint 0 / **943 tests**.
  3. ✅ **Phase 3 — supporting lib modules. DONE.** Three colocated-tested lib
     modules extracted from the component (all lib-clean — no React/Zustand/Tauri/
     services imports; `ndi-push` injects its `send`):
     - `transitions.ts` — `snapshotCanvas` (full program-frame copy) +
       `snapshotSlideElements` (elements-only, surface-sized) for the cross-fade
       snapshots. `snapshotCurrentCanvas`/`snapshotElementsOnly` now delegate.
     - `asset-cache.ts` — `preloadImage` / `preloadVideoBackground` /
       `preloadThemeAssets` (CORS-clean loaders firing an `onLoaded` redraw).
       `preloadThemeImages` collapses to one call; the slide-element and prop
       inline `new Image()` loops now use `preloadImage` (dedup). (The per-asset
       DEV `console.debug` lines were dropped — cosmetic, non-behavioral.)
     - `ndi-push.ts` — `captureAndSendNdiFrame` owns the keyed-vs-opaque canvas
       capture + scratch-canvas scaling; `pushNdiFrame`'s ~65-line capture block is
       now a single call (the decision layer — `shouldPushNdiFrame`/
       `shouldSendTransparentNdi` + back-pressure/keyed computation — stays in the
       component, reading its refs). Byte-identical capture logic; the scratch
       canvas is passed as the `ndiCanvasRef` holder.
     Gate: typecheck 0 / lint 0 / **956 tests** (+13: transitions 2, asset-cache 6,
     ndi-push 5).
  4. ✅ **Phase 4 — single render loop. DONE (behavior-preserving coalescing).**
     `lib/broadcast-output/render-loop.ts` — `createRenderLoop({ onFrame })` runs
     ONE RAF for all seven animation reasons (slideVideo, mediaLayer, slideAnim,
     marquee, countdown, themeAnim, baseVideo). Reasons are (de)activated by the
     listeners; the loop draws at most once per frame and calls `onFrame(shouldPush)`.
     Per-reason semantics preserved exactly via flags:
     - `push` — themeAnim/baseVideo stay **draw-only** (they never pushed NDI on
       their own); the rest push. `shouldPush` is true iff any active reason wants
       it, so a draw-only reason mixed with a pushing one still pushes.
     - `keepAlive` + `keepAliveTiming` — auto-deactivation checked **before** the
       frame (slideVideo/marquee/countdown — skip the final draw, matching the
       loops that guarded at the top of their tick) or **after** (slideAnim —
       advance tracker, draw, then decide, matching the original). `beforeFrame`
       runs slideAnim's `updateAnimationTracker`.
     Colocated test (9 cases, fake RAF clock: coalescing, push semantics, both
     keepAlive timings, stop/idempotent-activate). The **media-video transport
     loop** (`videoRafRef`, with trim/end-action/progress) and the **transition
     loop** stay separate by design (bespoke, non-draw+push logic); the stage clock
     stays a `setInterval`. The loop instance is created in the main effect and
     published via a ref the render-scope starters read (avoids the
     `react-hooks/refs` render-read lint). Removed 7 RAF refs + `startSlide/
     MediaLayerVideoLoop` bodies. **Net behavior: fewer draws/frame when multiple
     animations overlap (resolves P1); identical push cadence and per-frame output.**
     Gate: typecheck 0 / lint 0 / **965 tests** (+9). ⚠️ *Live NDI/projector smoke
     pending (see checklist) — not runnable in the refactor environment.*
  > **⏸ STATUS after Phase 4 — S2 substantively COMPLETE; 5–6 DEFERRED (risk/reward).**
  > Phases 1–4 landed & gated (typecheck 0 / lint 0 / 965 tests). All broadcast-
  > output business logic now lives in tested `lib/` (compositor, transitions,
  > asset-cache, ndi-push, render-loop); the P1 perf win is banked. Phases 5–6 only
  > shrink `broadcast-output.tsx` further by relocating the remaining **React glue**
  > into hooks — cosmetic/structural, no feature/bug/perf gain — while carrying
  > **high, un-mitigable risk** (blind rewrite of the live projector + NDI event
  > wiring, **no automated-test coverage possible**; the `useBroadcastEvents`
  > centerpiece is the high-risk `subscribeMainEvents` rewrite). Verdict on review:
  > **high risk / low reward → does not clear the bar.** Do 5–6 only in a
  > live-access session where the smoke test is cheap.
  > **Smoke checklist for 1–4** (run `npm run tauri`): open the output window +
  > NDI; verse take/clear/black/logo; slide take incl. transition + entry
  > animation; media image/video (play/pause/seek/trim/end-action); animated verse
  > theme bg + video base bg (projector animates; NDI animates only alongside a
  > pushing overlay — unchanged); marquee prop + countdown (scroll/tick + NDI);
  > media layer under transparent content; alt output + custom/NDI resolution.
  5. 🟡 **Phase 5 — React hooks: PARTIAL (safe, separable extractions landed).**
     The cleanly-separable, self-contained concerns were extracted as faithful,
     behavior-neutral moves (each with its own listener/cleanup, no entanglement
     with the shared-ref core):
     - `lib/broadcast-output/config.ts` — `parseBroadcastConfig(hash)` (pure, +test);
       the module `OUTPUT_ID`/`OUTPUT_MODE` consts now derive from it.
     - `hooks/use-stage-clock.ts` — `useStageClock` (the stage-mode 1s clock effect).
     - `hooks/use-ndi-keepalive.ts` — `useNdiKeepalive` (the 2s idle-push effect).
     - `hooks/use-window-surface.ts` — `useWindowSurface` (window inner-size +
       resize tracking, pulled out of the main effect + its cleanup).
     Gate: typecheck 0 / lint 0 / **968 tests** (+3). Component 1456 lines.
     **DELIBERATELY NOT DONE (high-risk / low-reward, needs live verification):**
     `useBroadcastEvents` (the ~900-line listener effect → the `subscribeMainEvents`
     rewrite Phase 1 flagged high-risk), `useBroadcastCompositor` (canvas + draw +
     render loop), `useMediaPlayback` (the media-transport state machine). These
     share ~40 refs, so a split is either a risky rewrite or a 40-arg faithful move
     (worse code); both only pay off in *file tidiness*, and neither can be
     unit-tested. Left intact — do them in a live-access session (cheap smoke test).
     The ~80-line-component target is therefore **not** reached (by design).
  6. ✅ **Phase 6 — effectively COMPLETE (no code change needed).** Assessment
     against current code:
     - *"OutputWebLayer routed through the same gateway"* — **already done** (Wave 1):
       `output-web-layer.tsx` uses `listenOutputEvent(webContent/webTransport/mute)`
       + `emitWebProgress`; no raw `listen`/`invoke`.
     - *"extract useYouTubePlayer"* — the hook **already exists** (`hooks/
       use-youtube-player.ts`) and is used by 3 operator components (youtube-view,
       live-output-panel, web-properties).
     - The only conceivable leftover — routing `OutputWebLayer`'s player through
       that hook — was **rejected as a net-negative refactor**: the two are distinct
       consumers in **different windows** (operator hook = polled React UI state;
       output layer = IPC progress echo + start/end out-point enforcement + isLive/
       jumpLive + fresh-div-per-present lifecycle). Merging would bloat the shared
       hook with output-only concerns and complicate the 3 working consumers, with
       no runtime duplication to remove (they never share a window). Left as-is.
- **Gate per phase:** typecheck + lint + test; golden-frame parity green; manual
  audience-output + NDI smoke.

---

# WAVE 4 — Collapse UI duplication

## D1 — Slide render loop exists in triplicate — ✅ DONE (all 3 phases)
- **Severity:** High (guaranteed drift)
- **Status:** DONE. The two near-identical operator canvases (`SlidePreviewCanvas`
  in `preview-panel.tsx`, `LiveSlideCanvas` in `live-output-panel.tsx`) collapsed
  into one shared leaf `components/slides/slide-canvas.tsx` (`SlideCanvas`,
  memoized — mirrors the `CanvasVerse` precedent, built on the pure `renderSlide`).
  The genuinely-duplicated ~35-line video/animated-background loop orchestration was
  extracted to `lib/slide-renderer/preview-loop.ts` (`runSlidePreviewEffect`, lib-
  clean: DOM primitives only, no React/Zustand/Tauri) with a colocated test (7
  cases: static/animated/cached-video/uncached-video-load/image-preload/prior-video-
  pause/cleanup). The **third** copy — the output-window slide path — is already the
  S2 compositor's `renderSlideContent`, so all three surfaces now share one render
  path. Both panels' now-dead `renderSlide`/predicate/`slide-image-cache` imports
  were pruned.
  - **Parity test:** a cross-surface guard in `preview-loop.test.ts` drives
    `composeFrame` with a static opaque slide and asserts the compositor issues a
    single `renderSlide` call with `{ frameTime }` — byte-identical to the operator
    `SlideCanvas` opts (`{ frameTime, hideElements: undefined }`, inert). Preview ==
    live holds by construction (one shared component); this closes the output
    surface. (Transparent slides intentionally diverge: the output composits over
    the base theme, the operator preview is a standalone slide preview — locked by
    the existing 22-case `compositor.test.ts`.)
- **Design note:** chose a `SlideCanvas` leaf over a `useSlideCanvas` hook because
  both call sites render an identical `<canvas>` — the leaf removes the markup dup
  too. jsdom has no real canvas, so the operator `draw` isn't unit-testable
  directly; the tested surface is the extracted loop + the compositor parity guard.
- **Gate:** typecheck 0 / lint 0 / **975 tests** (+7). ⚠️ *Live projector smoke
  (schedule preview + live monitor: static / animated-bg / video-bg slides) pending
  — not runnable in the refactor environment.*
- **Evidence (original):** `SlidePreviewCanvas` (`preview-panel.tsx:29-123`),
  `LiveSlideCanvas` (`live-output-panel.tsx:67-164`), and output-window slide path
  (`broadcast-output.tsx:1062-1228`) were near-identical; differed only by a
  `hideElements` flag.

## D2 — Overlays painted twice (canvas + DOM) — ✅ DONE (Option 1: single canvas)
- **Severity:** Medium-High (self-documented drift; every prop type added twice)
- **Decision (Phase 1):** **Option 1 — single canvas operator preview reusing the
  audience painters** (chosen by the user over "keep DOM, share a descriptor").
  Rationale: the media desk often runs off the operator's Live-display mirror
  *instead of* eyeballing the projector, so the mirror must be a faithful
  reflection — same geometry, same marquee scroll, same overlay order. The DOM
  mirrors were `pointer-events-none` (no interactivity to preserve), so nothing
  argued for keeping them.
- **Status:** DONE. The two DOM mirrors (`PropsOverlay`, `AlertPreviewOverlay` in
  `live-output-panel.tsx`) are deleted and replaced by one
  `components/broadcast/overlay-canvas.tsx` (`OverlayCanvas`, memoized). It draws a
  1920×1080 canvas (letterboxed `object-contain` in the same `inset-3` content box
  as `SlideCanvas`/`CanvasVerse`) via the audience painters through the new pure
  `lib/broadcast-output/operator-overlay-data.ts` → `drawOperatorOverlays` (props →
  alerts → countdowns, the exact order + surface `paintOverlays` uses with a null
  layer filter). A per-frame RAF runs only while something animates (a marquee
  scrolls, a countdown ticks/flashes); static props/alerts get a single draw.
- **Drift closed by construction:**
  - **Marquee timing** — the DOM used a CSS `translateX 0→-50%` over `(600/speed)*4`
    s; the canvas uses the audience's `now`-derived tiling. Now one implementation.
  - **Countdowns** — the operator Live display had **no** WYSIWYG countdown mirror
    at all (only the separate corner control pill). It now shows the same themed /
    fullscreen / positioned countdown the audience does.
  - **Black/Logo order** — the old DOM alert sat at `z-30`, *above* the Black cut
    (`z-20`), so a blackout didn't hide it in preview; the audience paints
    Logo/Black **after** overlays. `OverlayCanvas` sits at `z-[15]` (below the
    finishers), so Black/Logo now cover overlays — matching the audience.
- **Single-source wins beyond overlays:** countdown-theme resolution was duplicated
  (countdown store's private `resolveTimerTheme` vs. what the preview would need);
  extracted to pure `lib/countdown/resolve-theme.ts` and consumed by both the store
  (emit side) and the operator overlay — they can't disagree on which theme a timer
  paints with.
- **Parity test:** `operator-overlay-data.test.ts` drives the real `composeFrame`
  (audience compositor) with `layerFilter: null` and the same overlay state, mocks
  `./overlays` to record painter ops, and asserts `drawOperatorOverlays` issues a
  **byte-identical** op sequence (props/alerts/countdowns, 1920×1080, same `now`,
  same assembled inputs). Plus unit coverage on the derivations + `resolve-theme`.
- **Image props:** the painter looks images up by the **raw** `prop.imageUrl` key
  (as the audience does), but `OverlayCanvas` loads the `src` through `safeFileSrc`
  for the main window's asset protocol (the D5/CSP foot-gun) — cache key raw, src
  resolved.
- **Gate:** typecheck 0 / lint 0 / **986 tests** (+11: resolve-theme 5,
  operator-overlay-data 6). ⚠️ *Live smoke pending (not runnable here): trigger an
  alert (bar / lower-third / fullscreen), a marquee + text + image prop, and a
  countdown (positioned / themed / fullscreen) while Live — confirm the operator
  Live-display mirror matches the projector, and that Black/Logo cover them.*
- **Evidence (original):** canvas painter in `lib/broadcast-output/overlays`; DOM
  mirrors `PropsOverlay`, `AlertPreviewOverlay` in `live-output-panel.tsx`, whose
  comments admitted they "intentionally parallel" the canvas painter.

## D3 — `broadcast-settings.tsx` main/alt output copy-pasted wholesale — ✅ DONE (approach A)
- **Severity:** Medium-High (~133 `alt` references; the file's biggest issue)
- **Status:** DONE. `broadcast-settings.tsx` **1633 → 450 lines**; ~133 `alt` refs
  dropped to **6** (cosmetic title/placeholder strings in the two `<OutputCard>`
  calls). Extracted: `hooks/use-output-controller.ts`
  (`useOutputController(outputId)` — per-output state + open/toggle/NDI
  choreography + its own monitor-nudge/reconcile effects; placed in `hooks/` not
  `lib/` per the layering rule; **stage-aware by construction** via
  `output.mode === "stage"`, so main is byte-identical and alt keeps its stage
  pathway), `components/broadcast/output-card.tsx` (one `OutputCard` for both),
  `components/broadcast/ndi-settings.tsx` (shared NDI block),
  `services/tauri-env.ts` + `services/output-errors.ts` (runtime/env boundary),
  `lib/broadcast/base-background.ts` (+9 tests) and `lib/broadcast/monitors.ts`
  additions `primaryMonitorIndex`/`monitorLabel` (+6 tests).
  - **Approach A (user-approved) unification:** theme value now *derived from the
    store output* (drops the mirrored `useState` + main-only reconcile effect), so
    **both** outputs' theme selects follow external store changes — closing the alt
    staleness gap (also clears the broadcast-settings half of **P4**). The old
    main-only 750ms preview poll was **dropped, not propagated** — it discarded its
    result and had no side effect (dead code), so removal is behavior-preserving.
  - **Gate:** typecheck 0 / lint 0 / **1001 tests** (+15). ⚠️ *Live smoke pending
    (not runnable here): open/toggle both outputs (display + NDI), Start/Stop NDI,
    the stage (alt) pathway, and the alt theme select following external changes.*
- **Evidence:** every state field, handler, and JSX card duplicated with `alt`
  prefix (`broadcast-settings.tsx` L519-551, 735-1016, 1071-1565).
- **Plan:**
  1. **Phase 1** — `lib/broadcast/use-output-controller.ts`: per-output state +
     `openWindow`/`toggleNdi`/`toggle` + resync choreography, parameterized by
     `outputId`. Removes the local-state-mirrors-store-state reconciliation
     effects (also addresses **P4** here).
  2. **Phase 2** — `broadcast/output-card.tsx`: one `OutputCard({ outputId })`
     replacing both cards; `broadcast/ndi-settings.tsx` for the shared NDI block.
  3. **Phase 3** — shell renders `<OutputCard id="main"/> <OutputCard id="alt"/>`.
     Extract `services/tauri-env.ts` (`isTauri`, `isMissingCommand`) and
     `services/output-errors.ts` (`reportOutputError`); move `makeBaseBackground`,
     `baseSourceOf` → `lib/broadcast/base-background.ts`; monitor derivations →
     `lib/broadcast/monitors`.
- **Gate:** typecheck + lint + test; manual: open/toggle both outputs, NDI on/off.

## D4 — `search-panel.tsx` verse-row cluster + queue construction duplicated — ✅ DONE (approach A)
- **Severity:** Medium
- **Decision (approach A — user-approved):** the two verse rows are NOT identical
  (book has an Edit button, selection highlight, multiselect + keyboard nav,
  multi-verse drag; context has a similarity badge + query highlighting). Chose to
  **parameterize / preserve** each row's current features rather than unify — the
  genuinely-shared bits (add-to-queue, lexicon toggle, in-queue flash, highlighted
  text, translation select, multi-select bar) were extracted; the divergent layouts
  stayed as two tab components. Plus one **a11y fix**: the context "already in
  queue" indicator (a non-focusable `<span>`) became the accessible `<button>` the
  book row already used.
- **Status:** DONE (all 4 phases). `search-panel.tsx` **1425 → 685 lines**.
  - **Phase 1 — lib helpers (tested):** `lib/search/queue-item.ts` (`makeQueueItem`
    — one builder for all three add-to-queue sites; `confidence` + optional `verses`
    parameterized) and `lib/search/schedule-items.ts` (`buildScriptureScheduleItem`
    — the schedule-item construction from the multi-add loop). +7 tests.
    *Deviation:* the plan's `buildScheduleItemsFromVerses` (plural) became a
    single-item builder because the insert-and-skip sequencing (order only advances
    on a successful insert) must stay in the caller; and `switchTranslation` folded
    into the shared `TranslationSelect` component instead of the gateway (a gateway
    can't touch the store without inverting the layer arrow — it's all I/O anyway).
  - **Phase 2 — shared leaves:** `components/panels/search/` — `HighlightedText`,
    `LexiconToggle`, `QueueButton` (owns the add + in-queue-flash, a11y-fixed),
    `TranslationSelect`, `MultiSelectBar`. *Deviation:* chose shared **leaves** over
    a single variant-branching `VerseRow` container — per the approach-A analysis
    the two row layouts differ enough that the shared value is in the leaves, not a
    monolithic row (mirrors the D1 "leaf over hook" call).
  - **Phase 3 — hooks:** `hooks/use-verse-multiselect.ts` (multiselect state +
    ctrl/shift picking + the group actions, folding in the old `useMultiVerseActions`)
    and `hooks/use-verse-list-keyboard.ts` (arrow-key nav). *Deviation:*
    `useBibleNavigation` (the pending-navigation subscription + initial-load effects)
    was **kept inline in the shell** — it is tightly coupled to the shell's refs
    (`quickNavRef`/`panelRef`), tab setters, and nav state; a faithful extraction is
    a many-param move with no unit-test gain (same call as S2 P5/6).
  - **Phase 4 — tabs:** `book-search-tab.tsx` + `context-search-tab.tsx` (faithful
    JSX moves using the shared leaves); the shell is now a composition root
    (content/book-context tab bars, sticky search inputs, the two tabs, modals).
- **Gate:** typecheck 0 / lint 0 / **1008 tests** (+7: queue-item 4, schedule-items
  3). ⚠️ *Live smoke pending (not runnable here): add-to-queue + in-queue scroll on
  both lists, multi-select group actions (schedule / edit / queue / present),
  arrow-key verse nav, lexicon toggle on both, context similarity highlighting.*
- **Evidence:** verse-row action cluster rendered twice (book-search + context);
  queue-item construction duplicated ×3; "already-in-queue flash" ×2.
- **Original plan (for reference):**
  1. **Phase 1 — lib helpers:** `lib/search/queue-item.ts` (`makeQueueItem`),
     `lib/search/schedule-items.ts` (`buildScheduleItemsFromVerses` from
     `handleMultiAddToSchedule`); `switchTranslation(id)` wrapper in the
     translation gateway.
  2. **Phase 2 — shared components:** `panels/search/verse-row.tsx` (+ `QueueButton`,
     `LexiconToggle`), used by both lists; `multi-select-bar.tsx`;
     `highlighted-text.tsx`.
  3. **Phase 3 — hooks:** `useBibleNavigation` (pendingNavigation subscription +
     load-chapter + re-select), `useVerseMultiselect`, `useVerseListKeyboard`,
     `useMultiVerseActions`.
  4. **Phase 4 — tabs:** `book-search-tab.tsx`, `context-search-tab.tsx`; shell
     mounts tabs + modals.
- **Gate:** typecheck + lint + test; new lib helpers get colocated tests.

---

# WAVE 5 — Performance cleanup

## P1 — Competing RAF loops in the output window — ✅ DONE
- **Severity:** Medium-High
- **Status:** DONE. The behavioral win landed in **S2 Phase 4** (single coalesced
  `render-loop.ts`). Verification item closed here: `render-loop.test.ts` gained a
  **single-RAF invariant** test — activating all 7 animation reasons keeps
  `clock.pending() === 1` across frames (at most one RAF scheduled regardless of
  reason count), complementing the existing coalescing/no-stack cases.
  ⚠️ *Live NDI push-count-per-second measurement still needs the desktop shell
  (`npm run tauri`) — not runnable in the refactor environment.*
- **Evidence:** slide-anim, media-layer, marquee, countdown, theme-anim loops ran
  simultaneously, each calling full `draw()` + `pushNdiFrame()` (`getImageData`
  readback).
- **Gate:** typecheck 0 / lint 0 / test green.

## P2 — Layout thrash during layer drag — ✅ DONE
- **Severity:** Medium
- **Status:** DONE. `LayerList` no longer reads layout on `pointermove`. Row rects
  are snapshotted once at `pointerdown` (`captureLayerRowRects`) — the list doesn't
  reflow mid-drag — and the hover update is rAF-coalesced to one `setOverIdx` per
  frame (`pickLayerIndexAtY` over the cached rects; pending RAF cancelled on
  `pointerup` and on unmount). Extracted the pure hit-test to
  **`lib/slides/layer-drag.ts`** (+colocated test, 6 cases: half-open `[top,
  bottom)` boundary parity with the old scan, out-of-range null, first-match on
  overlap, marker-attr filtering). The final reorder index math is unchanged, so
  behavior is byte-identical bar the removed per-move reflow.
- **Evidence:** `LayerList.handlePointerMove` ran `querySelectorAll` +
  `getBoundingClientRect` on every pointer move (`presentation-editor.tsx:141-153`).
- **Gate:** typecheck 0 / lint 0 / test green. ⚠️ *Drag-smoothness smoke pending.*

## P3 — Per-invocation canvas allocations — ✅ DONE
- **Severity:** Low-Medium
- **Status:** DONE. Both sites in `presentation-editor.tsx` now reuse persistent
  offscreen canvases held in refs (`measuringCanvasRef`, `prevFrameCanvasRef`) via
  the new pure **`lib/dom/offscreen-canvas.ts`** → `acquireOffscreenCanvas(holder,
  w, h, clear?)` (+colocated test, 7 cases: create-on-first-use, instance reuse,
  no-reassign-when-unchanged, per-dimension resize, and the clear/no-clear
  branches). The entry-anim **measuring** canvas passes `clear=false` (measurement
  only, no visible pixels); the transition **prevCanvas** keeps the default
  `clear=true` so the transparent-background path composits over a blank surface —
  byte-identical to the old fresh-canvas semantics.
- **Evidence:** `handlePreviewTransition` allocated a fresh 1920×1080 offscreen
  canvas per call; entry-anim effect allocated a throwaway measuring canvas per
  slide change.
- **Gate:** typecheck 0 / lint 0 / test green. ⚠️ *Transition-output visual smoke
  pending (jsdom has no real canvas — parity is by construction + helper unit test).*

## P4 — Local state mirroring store state (reconciliation effects) — ✅ DONE (Option A)
- **Severity:** Medium
- **Status:** DONE for the named scope. The store-mirror antipattern P4 targeted
  (`broadcast-settings` local `mainThemeId`/`mainEnabled` copies + reconcile
  effects) was **already eliminated by D3** (theme derived from the store output)
  and **S2** (output-window effects moved into hooks reading the store/refs
  directly). Verified now: `broadcast-output.tsx` has **zero** `set-state-in-effect`
  disables; `broadcast-settings.tsx` has **one** (`fetchMonitors()` on open — a
  justified async-load loading flag, not a mirror); the one reconcile in the
  D3-extracted `use-output-controller.ts` (`setSelectedMonitor` monitor steer) is
  an **intent-preserving** stateful nudge that must NOT be derived (deriving would
  clobber the operator's manual monitor pick). No safe mirror-removal remains in
  the broadcast cluster — **Option A is satisfied with no further code change.**
- **Option B (whole-app sweep) DEFERRED — see `repumbling.md`.** A full audit finds
  14 `set-state-in-effect` disables across 9 files; **none is a store-mirror**.
  They are async-load-on-open, reset-derived-UI-on-change, animation triggers, and
  the intent-preserving reconcile — all defensible. B would be cosmetic
  modernization (key-remount / derive-in-render for the 5 reset-on-change sites),
  low-value and higher-risk on live-critical screens; do a row opportunistically
  when already in the file, not as a dedicated sweep. Full inventory + per-site
  treatment recommendation lives in `repumbling.md`.
- **Evidence (original):** `set-state-in-effect` eslint-disables — the plan's
  "3 in `broadcast-settings.tsx`, 3 in `broadcast-output.tsx`" measurement predated
  D3/S2; those specific mirrors are gone.
- **Gate:** typecheck 0 / lint 0 / test green (no code change — audit result).

---

# WAVE 6 — Rust backend split (independent)

## R1 — `stt.rs` fuses STT transport and verse detection (1270 lines) — ✅ DONE
- **Status:** DONE (all 4 phases). The 1270-line `commands/stt.rs` monolith is now
  a `commands/stt/` module — a **124-line orchestration `mod.rs`** (the two
  `#[tauri::command]`s + `truncate_safe`) plus 5 focused submodules:
  `model.rs` (139 — model resolve + `build_provider`/`build_fallback`),
  `supervisor.rs` (153 — `run_stt_supervisor` + `deepgram_reachable`),
  `audio.rs` (178 — the `!Send` cpal capture/fan-out thread), `events.rs` (254 —
  transcript-event consumer + the 2 background detection workers), and
  `detection.rs` (604 — direct/semantic/reading/translation).
  - **`check_reading_mode` decomposed** (Phase 3) into `maybe_start_reading_mode` /
    `handle_chapter_nav` / `handle_advance`, control-flow byte-identical (each
    original early-return mapped exactly: poison-abort → `Some(false)`, handled →
    `Some(true)`, fall-through → `None`).
  - **Live vs on-demand detection kept SEPARATE** (user decision) — `detection.rs`
    reuses only `crate::commands::detection::{to_result, DetectionResult}` from the
    batch path; `detect_verses` untouched.
  - **Phase 4 — clippy silences:** the two originally-flagged `#[expect(too_many_lines)]`
    (on `start_transcription` and `check_reading_mode`) are **removed** — both are now
    under the limit. Two *new* cohesive I/O loops (`spawn_audio_fanout`,
    `spawn_transcript_processing`) carry a `#[expect(too_many_lines, reason=…)]` each:
    splitting the `!Send` capture-rebuild loop / the single transcript-event consumer
    would fragment a hot path with threaded-through state — the same rationale the
    pre-existing `#[allow]` on `run_semantic_detection` already uses. **Deliberate
    deviation from "no silenced too_many_lines"**, chosen over rewriting untested
    live-audio loops that can't be verified in this env.
  - **Gate:** `cargo build` clean / `cargo clippy` adds **zero** new warnings (only 4
    pre-existing `broadcast.rs` doc-backtick nits remain) / `cargo test` 7 pass.
    ⚠️ *Live STT + detection mic smoke deferred (no audio hardware/models here) — per
    the accepted-no-live-verification decision.*
- **Severity:** High (regression risk)
- **Evidence:** ~500-line `start_transcription` megafunction; ~530 lines of
  detection logic (`run_direct_detection`, `run_semantic_detection`,
  `check_reading_mode`) fused with audio/model/supervisor/event code;
  `#[expect(clippy::too_many_lines)]` silenced in 3 spots.
- **Plan:**
  1. **Phase 1 — `commands/stt/` module dir**, thin `mod.rs` keeping the two
     `#[tauri::command]`s + channel wiring.
  2. **Phase 2 — extract transport:** `model.rs` (moonshine resolve, provider +
     fallback construction), `audio.rs` (the `!Send` cpal capture/fan-out thread +
     device-loss watchdog + level metering), `supervisor.rs`
     (`run_stt_supervisor` + `deepgram_reachable`), `events.rs` (transcript event
     consumer + latency/queue instrumentation collapsed into small structs).
  3. **Phase 3 — extract detection:** `detection.rs` (direct/semantic/reading/
     translation). Consider merging with the existing `commands/detection.rs` via a
     shared `detection_runtime` so `detect_verses` and the live path share one
     pipeline. Decompose `check_reading_mode` into
     `maybe_start_reading_mode`/`handle_chapter_nav`/`handle_advance`.
  4. **Phase 4 — remove the clippy `#[expect]`s** once functions are under the
     line limit.
- **Gate:** `cargo build`, `cargo clippy` clean (no silenced `too_many_lines`),
  `cargo test`; live STT + detection smoke.

## R2 — Repeated lock boilerplate + multi-lock TOCTOU in `check_reading_mode` — ✅ DONE (targeted)
- **Status:** DONE via the **targeted fix** (user-approved after a code-review
  finding overrode the original "one DetectionState" idea — see below).
  - **The TOCTOU is real and now fixed (Phase 2).** `ReadingMode` is mutated by BOTH
    the live detect worker AND the `stop_reading_mode` UI command, so the old
    decide→(release rm)→read-DB→(re-lock rm)→act sequence let a stop interleave
    between the decision and the start. `maybe_start_reading_mode` and
    `handle_chapter_nav` now hold a **single `ReadingMode` critical section** across
    decide→read→act (lock order **rm → bible**, released before any IPC emit).
    `handle_advance` was already atomic (check + compute under one lock). Behavior is
    otherwise byte-identical (every original early-return value preserved).
  - **Lock ordering documented (Phase 1)** in the module header: detector states stay
    under **separate** mutexes on purpose (direct never blocks on semantic ONNX);
    the only two-lock path is reading mode, always rm→bible, and `run_direct_detection`
    takes bible alone so no `bible→rm` deadlock path exists. The reading-mode lock
    boilerplate itself dropped where it mattered (5 rm-lock acquisitions → 2).
  - **DELIBERATE DEVIATION from decision #3 (full `DetectionState` merge) — rejected
    on review.** Merging `DirectDetector`/`DetectionMerger`/`DetectionPipeline`/
    `ReadingMode` under one lock would serialize the instant direct path behind the
    300–600ms semantic ONNX search — a latency regression the current separate-locks
    design explicitly avoids. User chose the targeted fix instead. A blanket
    lock-helper across all 19 `.lock()` sites was also declined: varied per-site
    early-return values + untestable-here live code made it risky churn for cosmetic
    gain; the boilerplate was cut in the reading-mode path where the race lived.
  - **Phase 3 — `RwLock` for `BibleState.db`: EVALUATED → DEFERRED.** Read-mostly, yes,
    but the reads are short indexed queries with low real contention (the detect
    worker is sequential), while the conversion touches **every**
    `app.state::<Mutex<BibleState>>()` site across `bible.rs`/`detection.rs`/`stt/`/
    `lib.rs` (Mutex→RwLock, `.lock()`→`.read()`/`.write()`). Large blast radius on
    untested-here code for marginal benefit — not worth it now. Revisit if profiling
    shows real read contention.
  - **`check_translation_command` `try_lock`:** left as-is — it runs INLINE on the
    async event-consumer (not `spawn_blocking`), so its non-blocking `try_lock` on
    `BibleState` is deliberate; a blocking lock there could stall the transcript
    consumer. Noted, not changed.
  - **Gate:** `cargo build` clean / `cargo clippy` **zero** new warnings / `cargo test`
    7 pass. ⚠️ *Live concurrency smoke (stop-reading-mode mid-detection under sustained
    audio) deferred — not runnable here.*
- **Severity:** Medium (correctness under load)
- **Evidence:** `.lock()` copy-pasted a dozen+ times; `ReadingMode` locked/released
  repeatedly within `check_reading_mode` (decisions computed under one lock, acted
  on under later ones — a TOCTOU race); `check_translation_command` `try_lock`
  silently drops commands under contention.
- **Plan:**
  1. **Phase 1** — a `LockedStates`/facade helper (or wrap related detector state
     in one cohesive `DetectionState`) to make lock ordering explicit and kill the
     boilerplate.
  2. **Phase 2** — hold a single critical section across the read/decide/act in
     `check_reading_mode`; document lock order.
  3. **Phase 3** — evaluate `RwLock` for read-mostly `BibleState.db`.
- **Gate:** `cargo test`; concurrency smoke under sustained audio.

## R3 — Startup panics on corrupt DB / poisoned lock — ✅ DONE
- **Status:** DONE (both phases). The ~180-line `.setup(...)` closure is now a
  9-line orchestrator calling three helpers in a new `src/setup.rs`:
  `init_bible_db` / `init_semantic` / `wire_main_window_teardown`. The
  `#[expect(too_many_lines)]` on `run()` is **removed** (now under the limit).
  - **Phase 2 — panics converted (decision #4):** the `lib.rs:107`
    `.expect("Failed to open Bible database")` and the `.unwrap()`s at 116/132/206
    are gone.
    - **DB missing** → graceful degrade (warn + continue), unchanged.
    - **DB present but corrupt** → **refuse to start with a clear error** (setup
      returns `Err`, aborting launch) — NOT the old unhelpful panic. Covers BOTH
      detection points: `BibleDb::open` failing *and* the FTS5 health-check query
      failing. The latter matters because `BibleDb::open` has a read-only fallback
      that can open a corrupt file without validating it, so the health-check query
      is the reliable "opened-but-corrupt" signal — it now refuses instead of just
      logging.
    - **Startup lock poison:** the `BibleState` write lock → returns a clear `Err`
      (refuse); the registry-reattach and `DetectionPipeline` locks → degrade (log +
      skip), matching the "logged and skipped rather than aborting" philosophy for
      those optional steps.
  - **Semantic init** always degrades (optional feature) — never aborts.
  - **Test:** `setup::tests::corrupt_db_is_detected` (runnable here) writes a garbage
    file and asserts a corrupt DB trips `open()` or the health-check query — proving
    the refuse-to-start trigger fires. `cargo test` **8 pass** (+1).
  - **Gate:** `cargo build` clean / `cargo clippy` **zero** new warnings / 8 tests.
    ⚠️ *Full GUI boot-with-corrupt-DB smoke needs a desktop session (webview can't
    launch headless here) — the detection trigger is unit-verified instead.*
- **Severity:** Medium
- **Evidence:** `lib.rs:107` `.expect("Failed to open Bible database")`, `.unwrap()`
  on `bible.lock()` (116, 132, 206) in `setup`; DB-present-but-corrupt path panics.
- **Plan:**
  1. **Phase 1** — extract `setup::init_bible_db`, `setup::init_semantic`,
     `setup::wire_main_window_teardown` from the ~180-line `setup`.
  2. **Phase 2** — convert `.expect`/`.unwrap` to logged degradation matching the
     graceful DB-missing path already present (160-162).
- **Gate:** `cargo build`/`clippy`/`test`; boot with a deliberately corrupt DB.

---

# WAVE 7 — Long-tail component decomposition

## S7 — `settings-dialog.tsx` (1518 lines)
- **Severity:** Medium
- **Evidence:** 10 section components + shell in one module; three parallel maps
  (`navItems`/`sectionTitles`/`sectionComponents`) hand-kept in sync; duplicated
  API-key-field + toggle-card patterns.
- **Plan:**
  1. **Phase 1** — one file per section under `components/settings/sections/`.
  2. **Phase 2** — single `SETTINGS_SECTIONS` registry `{id,name,icon,title,Component}[]`
     replacing the three parallel maps.
  3. **Phase 3** — shared `settings/ui/toggle-card.tsx`, `api-key-field.tsx`,
     `section-slider.tsx`; hooks `use-api-key-field`, `use-remote-control`,
     `use-media-library-path`. Replace the `import("@/stores")` dynamic-import
     workaround in `BibleSection.handleChange` with a proper store/gateway call.
  4. **Phase 4** — shell renders sidebar + active section only.
- **Gate:** typecheck + lint + test.

## S8 — `presentation-editor.tsx` (1320 lines)
- **Severity:** Medium
- **Evidence:** ~790-line main component; 4 effects each owning a RAF handle
  (overlapping animation-loop ownership); ~120-line transition engine inline;
  export/import DOM handlers inline.
- **Plan:**
  1. **Phase 1 — lib:** `lib/slide-transition-preview.ts` (frame compositing),
     `lib/slide-io.ts` (JSON export / import), `slide-element-meta.tsx`
     (`elementIcon`/`elementLabel`/`TRANSITION_LABELS`); shared `SLIDE_W/SLIDE_H`
     constants.
  2. **Phase 2 — hooks:** `useSlideCanvasRenderer`, `useSlideEntryAnimation`,
     `useSlideMediaPlayback`, `useTransitionPreview`, `useEditorKeyboardShortcuts`.
     Unify RAF ownership under one coordinator (mirrors S2/P1).
  3. **Phase 3 — components** under `components/slides/editor/`: `EditorToolbar`,
     `EditorCanvas`, `SlideStrip`, `SlideThumb`, `LayerPanel`/`LayerToolbar`,
     `RightPanel`; shell composes them (~150 lines).
- **Gate:** typecheck + lint + test; transition/animation output parity.

---

# Cross-cutting guardrails to add (prevent regression)

- ESLint `no-restricted-imports`/`no-restricted-syntax`:
  - ban raw `invoke`/`listen`/`emitTo` outside `src/services/**` (S3).
  - ban `convertFileSrc` outside `lib/media/safe-file-src.ts` (D5).
- CI grep gates: fail on new `"broadcast:*"` string literals outside the gateway;
  fail on `TODO/TEMP/revert before commit` markers in `src/main.tsx`.
- Require colocated `*.test.ts` for every new `lib/` module and gateway.
- For any output-preserving phase, a parity/golden test is part of the PR.

# Definition of done (every phase)

1. Logic in `lib/`/`services/`, not components/stores.
2. No `invoke`/`listen`/`emit` outside `services/` (new code).
3. No React/Zustand/Tauri imports in `src/lib/**`.
4. Narrow selectors; no per-event whole-doc clones; debounced undo.
5. Hot paths not regressed; output-preserving changes proven byte-identical.
6. Tests added/updated and colocated.
7. `npm run typecheck && npm run lint && npm test` clean — reported honestly.
   (Rust: `cargo build && cargo clippy && cargo test`.)
