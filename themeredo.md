# Theme Redo — Clean-slate, type-first theming (ProPresenter model)

Planning doc. **Scratch / untracked — do not commit** (repo md rule).

**Decision (locked):** discard the half-done unification (the dual
`BroadcastTheme` / `SlideTheme` + `UnifiedTheme` container) and rebuild **all**
theming on **one** model — a styled slide with an **intrinsic theme type** and
**typed placeholders** that content flows into at go-live. This is the
ProPresenter model: a theme is a *look with placeholders*, not a category tag on
a fixed-slot skin.

---

## 1. The rules this must satisfy (from you)

1. **No "category" concept.** No category dropdown in the properties panel, no
   re-taggable label. A theme's **type is intrinsic**, chosen once at **New**,
   and cannot be changed into something the builder can't fulfill.
2. **New shows the exact thing you're building.** Picking a type opens a builder
   tailored to that type, pre-seeded with its placeholders. No generic blank you
   then classify.
3. **No "general" theme.** Removed.
4. **Type-specific controls.** The properties surface leads with the controls
   that matter for that type (scripture typography, timer format, …). Selecting
   an element shows *that element's* controls. No generic catch-all panel, and
   the old category `<Select>` in the panel is deleted.
5. **Six types:** Scripture, Song/Lyrics, Countdown, Sermon (title + points),
   Overlay / Lower-third, Announcement.

---

## 2. The one model

Everything shown live is a **Slide** (`background + elements[]`). A **Theme** is a
styled single-slide template of a given **type**, whose type-required elements are
**placeholders** that content fills at presentation time.

```ts
// src/types/theme.ts  (replaces the UnifiedTheme container entirely)
type ThemeType =
  | "scripture" | "song" | "countdown" | "sermon" | "overlay" | "announcement"

interface Theme {
  id: string
  name: string
  type: ThemeType          // intrinsic, chosen at New, drives builder + controls + presentation
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  background: SlideBackground
  elements: SlideElement[] // the authored look, incl. typed placeholders
  transition?: SlideTransition
}
```

**Placeholders (how content flows in).** Dedicated element types already carry
their own role; text placeholders get a lightweight `role` marker instead of
exploding the element union:

| Type          | Required placeholder element(s)                    | Filled at go-live with |
|---------------|----------------------------------------------------|------------------------|
| Scripture     | `SlideScriptureElement` (exists)                   | reference + verse text |
| Song/Lyrics   | text element `role:"lyrics"`                       | current lyric lines    |
| Countdown     | `SlideTimerElement` (NEW, Phase 2)                 | live ticking time      |
| Sermon        | text `role:"title"` + text `role:"points"`         | authored at build time |
| Overlay       | any elements, **transparent background**           | composited over live   |
| Announcement  | text `role:"title"` + text `role:"body"`           | authored at build time |

`role?: "lyrics" | "title" | "points" | "body"` is added to `SlideTextElement`
(recommended over new element types — keeps the renderer switch small and lets a
theme decorate freely around the placeholder). Scripture and Timer stay dedicated
element types because they render differently, not just styled text.

**Why this satisfies the rules:** the builder for a type seeds its required
placeholders and its properties panel leads with them (rule 2, 4); there is no
category because the type *is* the classification and it's fixed at creation
(rule 1, 3); you can still add arbitrary custom text/media around the placeholder
(the capability the old fixed-slot verse editor lacked).

---

## 3. What we're deleting (clean slate)

- `BroadcastTheme` as an **authoring** model, its fixed-slot designer
  (`design-canvas.tsx`, `properties-panel.tsx`, `theme-format-toolbar.tsx`), and
  the region concept (`textBox`/`verseText`/`reference`/`verseNumbers`).
- The `UnifiedTheme` container + lifters (`src/types/theme.ts` current,
  `src/lib/theme/convert.ts`, `builtin-themes.ts` registry projection).
- `ThemeCategory` / `SlideThemeCategory` enums and all category filters/labels
  (`theme-library.tsx:26`).
- The verse renderer (`src/lib/verse-renderer/*`) — **only after** the slide path
  reaches pixel-parity (Phase 4). Its low-level `wrapText` helpers move into the
  slide renderer first.
- Two `themeId` namespaces → one.
- Dual persistence (`broadcast-themes.json` `customThemes` +
  `presentations.json` `customSlideThemes`) → one theme store.

Retained/reused: the **slide renderer** (`src/lib/slide-renderer/*`), the unified
**output compositor** (one canvas, one `composeFrame`), the slide **editor
engine** (`PresentationEditor` and its canvas/interaction hooks), and the pure
**countdown math** (`src/lib/countdown/timer.ts`).

---

## 4. Guiding constraints (CLAUDE.md)

- **Decouple by domain.** New concerns are folders-with-barrels under `lib/`;
  pure logic only (no React/Zustand/Tauri in `lib/`); IPC behind `services/`
  gateways; colocated `*.test.ts`. Every module below is sized to stay small —
  templates, presentation-mappers, and the migrator are **one file per type**,
  not one giant switch.
- **Output-preserving = byte-identical, proven by parity tests** (the verse →
  slide switch in Phase 4 is the critical one).
- Respect the three hot paths; narrow selectors; debounced undo; cap buffers.

---

## 5. Phases

Each phase ends green on `npm run typecheck && npm run lint && npm test`.

### Phase 0 — Stabilize the current bug (throwaway, optional, cheap)

The reported overflow/disconnect will exist until the rebuild lands. If you want
it gone now, apply the minimal fixes (this code is later deleted, but it's small):
clear the opposite store's draft on New, key the designer grid on the active
editor (`theme-designer.tsx:339`), suppress the embedded `EditorToolbar` in
`themeMode`, and hide the category `<Select>`. Skip if you'd rather go straight to
the rebuild. **Recommend doing it** — the rebuild is multi-PR and you shouldn't
sit on a broken editor meanwhile.

### Phase 1 — The `Theme` model + one store + one persistence (parallel, additive)

Build the new model beside the old; nothing user-facing yet.

- `src/types/theme.ts` — replace with `Theme` + `ThemeType`; add `role?` to
  `SlideTextElement` (`src/types/slide.ts`).
- **New** `src/lib/theme/model/` (barrel) — pure constructors, validation
  ("scripture theme must contain a scripture placeholder"), and `role` helpers.
- **New** `src/lib/theme/builtins/` — one built-in `Theme` per type as code
  constants (replaces `BUILTIN_THEMES` + `BUILTIN_SLIDE_THEMES`).
- **New** store slice `src/stores/themes/` — `themes: Theme[]`, CRUD, one
  persistence file `themes.json` via a `services/` gateway (or the existing
  plugin-store adapter). Debounced save, `filter(!builtin)`.
- **New** `src/lib/theme/render/theme-to-slide.ts` — project a `Theme` (minus
  live content) to a `Slide` for previews, so the library thumbnails render
  through the slide renderer immediately.

Verify: model validation + builtin snapshot tests; store round-trips through
persistence. Risk: low (additive, old paths untouched).

### Phase 2 — Timer element (needed by Countdown type)

Add `SlideTimerElement` to the slide model, reusing `lib/countdown/timer.ts`
math (no duplication). Hook points (from recon):

- `src/types/slide.ts:150` union + `SlideThemeElement` mirror.
- `src/lib/slide-defaults.ts` factory.
- `src/stores/presentation/elements.ts:209` `addTimerElement` (+ slice types).
- **New** `src/lib/slide-renderer/timer.ts` `drawTimerElement`; dispatch in
  `slide-renderer/index.ts:50`.
- Thread `now`/`frameTime` into `SlideRenderOptions`
  (`slide-renderer/types.ts`); add `slideHasTimer` keep-alive predicate
  (`slide-renderer/predicates.ts`) wired to the output render-loop reasons.
- Add-menu item (`right-panel.tsx:146`) + **new** `slide-timer-properties.tsx`
  via `element-properties-router.tsx:22`.

Verify: pure timer-format/threshold tests; parity that the existing 5 element
types are byte-identical with the inert `now` param; per-frame-redraw test.
Risk: low-medium.

### Phase 3 — Type-first New flow + one editor + type-specific controls

The visible change that delivers your rules.

- **New** `src/lib/theme/templates/` — one file per type
  (`scripture.ts`, `song.ts`, `countdown.ts`, `sermon.ts`, `overlay.ts`,
  `announcement.ts`), each returning a seed `Theme` with its required
  placeholders. No `blank`/`general`.
- `theme-library.tsx:104` — **New ▾** lists the six types; each opens the slide
  editor in that type. Delete the two-option verse/song dropdown and all category
  filters/labels.
- **One editor**, parameterized by `theme.type`: seeds placeholders, curates the
  add-element menu, and mounts a **type-specific properties panel** — **new**
  `components/slides/editor/theme-properties/<type>-theme-properties.tsx` leading
  with that type's controls (scripture ref/verse typography; timer format +
  warn/danger; overlay transparency; sermon title/points; etc.). Selecting an
  element still shows element controls via the existing router.
- Remove the category `<Select>` and the whole fixed-slot designer chrome; the
  designer top bar is the only chrome (kills the duplicate-toolbar disconnect).

Verify: each template snapshot; New→type opens the right builder with right
placeholders; panel shows type controls, no category control anywhere.
Risk: medium (touches editor shell + library).

### Phase 4 — Unify live presentation on the slide path (the deep one)

Everything presents through `renderSlide`; retire the verse render branch behind
a parity gate.

> **Progress (increment 4a — landed, additive, green on all 3 gates):**
> - `src/lib/theme/present/` — per-type mappers `(theme, content) → PresentedSlide[]`
>   (`scripture`/`song`/`countdown`/`sermon`/`overlay`/`announcement`) + `presentTheme`
>   dispatcher, colocated tests. Text roles fill by element-swap; **scripture carries
>   the live `VerseRenderData` as a render-time payload** (`PresentedSlide.scriptureContent`)
>   per decision D2→render-time, NOT baked into `verseText`.
> - `src/lib/theme/present/parity/` — the parity **instrument**: a recording ctx +
>   `diffScriptureParity` that drives `renderVerse` vs `renderSlide` and enumerates the
>   current gaps. Baseline test documents them: **verse-number token, reference-format
>   (dash/uppercase/translation), text-transform, auto-fit body-font**; proves body
>   font already matches without auto-fit (the foothold). Nothing live consumes any of
>   this yet — no flip.
>
> **Decisions taken (this session):** D2 → **render-time payload** for scripture.
> D1 (base backdrop) → **deferred**; `paintBaseTheme` stays on the verse path for now.
>
> **Progress (increment 4b — landed, additive, green on all 3 gates):**
> - `drawScriptureElement` now takes an optional render-time payload
>   `ScriptureRenderPayload { verse: VerseRenderData; style: BroadcastTheme }`,
>   threaded through `SlideRenderOptions.scriptureContent: Map<elementId, payload>`
>   (mirrors `now`/`animationStates`). When present it **delegates to the verse
>   renderer's own `drawVerseText` / `drawReference`** (newly exported from the
>   verse-renderer barrel, alongside `measureVerseHeightAtFont`) drawn into the
>   element's box — so verse numbers, styled spans, interlinear, text-transform,
>   and reference format/uppercase reproduce **byte-for-byte**. When absent the
>   flat-string legacy path is unchanged (existing schedule/slide scripture usage
>   untouched — proven by a colocated `text-drawing.test.ts` case).
> - Parity gate flipped from "documents gaps" to "proves parity": the harness now
>   drives the payload path; `diffScriptureParity` reports **empty divergences**
>   across every built-in for both single- and multi-verse passages (no auto-fit).
> - **Insight that made it tractable:** the parity harness compares *text-level
>   facts* (drawn strings, font sizes, reference label), not geometry — and
>   `drawVerseText`/`drawReference` take explicit x/width/startY. So delegation
>   into the element's box reproduces the facts without reconciling geometry.
> - **Still no live flip** — nothing live sets `scriptureContent` yet (4c).
> - **Deferred to 4c:** body-font under **auto-fit** (the one remaining, asserted
>   divergence) — it's geometry-coupled (needs the placeholder box reconciled with
>   the theme text-area), and surface font-scaling of the payload style. Paging is
>   also 4c (multi-slide materialization).
>
> **Progress (increment 4c — landed, additive, green on all 3 gates):**
> - `drawScriptureElement`'s payload path no longer reimplements a block-in-box
>   layout; it now runs the **identical verse layout** `computeVerseLayoutMetrics`
>   (the same pass `renderVerse` uses) against the **draw surface** and draws the
>   verse/reference at its rects — mirroring `renderVerseImpl`'s fixed-region pass.
>   So **surface font-scaling** and **auto-fit** close for free (they *are* the
>   verse layout), and the theme layout — not the placeholder box — is authoritative
>   for geometry, exactly as on the verse path. The placeholder element's own
>   box/typography is intentionally not consulted for the payload path.
> - `ScriptureRenderPayload` grew an `options?: Omit<RenderOptions, "surface">`
>   field (auto-fit thresholds / offsets / opacity); `surface` is derived from the
>   canvas so one payload renders correctly at any output resolution.
> - Parity gate now holds **fully empty** across every scripture built-in *including
>   under auto-fit + surface scaling* (single + multi-verse). The old "still diverges
>   on body-font under auto-fit" case is flipped to assert exact agreement **and**
>   that auto-fit was genuinely exercised (font grew past authored).
> - **Scope honesty — the live compositor/sync flip is NOT done here, by design.**
>   The live output path (`compositor.ts` / `sync.ts`) runs on `BroadcastTheme`;
>   `presentTheme`/`themeToSlide` and the `PresentedSlide` model require the **new
>   `Theme`**, and there is **no `BroadcastTheme → Theme` bridge** (convert.ts is the
>   old `UnifiedTheme` world, retired in Phase 5). So "compositor renders the
>   presented slide + sync emits `slideUpdate` for scripture" is genuinely coupled to
>   the **Phase 5 data migration** — doing it now would either need a throwaway
>   bridge or risk a visible regression on real church output (the theme
>   background/textBox/decorations don't ride the scripture payload). What 4c *can*
>   and *does* deliver — the precondition the flip was gated on ("once the parity
>   gate holds") — is a slide path that reproduces `renderVerse` byte-for-byte under
>   all options. The compositor/sync repoint rides with Phase 5.
>
> **Progress (increment 4d — landed, additive, green on all 3 gates):**
> - **Stage display + NDI foreground already read the slide model** — verified, no
>   change needed. `stage-display-renderer.ts` (`renderContentPreview`) renders an
>   active `currentSlide` via `renderSlide` (falls back to `renderVerse` only when
>   there is no slide); `compositor.ts` `composeNdiForeground` draws
>   `drawSlideElements` for `activeMode === "slide"`. Both already present the slide
>   path whenever a slide is live; the scripture/verse branch stays until the 4c-live
>   flip. So this half of 4d was satisfied by the earlier slide-path work.
> - **Countdown parity instrument** — `src/lib/theme/present/parity/countdown-parity.ts`
>   (+ colocated test, exported from the parity barrel). Mirrors the scripture gate:
>   drives the reference path (`renderCountdownTheme` → `renderVerse`) against the
>   candidate path (`renderSlide` over a **timer-element** slide built from the theme)
>   through the recording ctx and reports divergences.
> - **Key difference from scripture (documented in the module):** the countdown look
>   *genuinely moves* representation — verse-region auto-fit digits → a
>   `SlideTimerElement` in its own box — so a byte-identical **pixel** gate is the
>   wrong instrument. The gate instead asserts the *content invariants* that must not
>   change: the **digit string**, the **urgency colour** (warn/danger), and the
>   **label** (casing included). Both paths derive these from the one shared
>   `lib/countdown` math, so the gate is empty across every `category:"countdown"`
>   built-in and locks that agreement in.
> - **Two real findings the harness surfaced** (fixed): the verse path (a) applies
>   the theme reference's `uppercase`/`textTransform` to the label — the candidate
>   heading element now mirrors it; and (b) emits an empty label token when hidden —
>   the fact extractor normalises an empty label draw to `null` so "hidden" compares
>   equal on both paths.
> - **Scope honesty — the live countdown repoint is NOT wired here, by design (same
>   coupling as 4c-live).** The live overlay (`overlays.ts` `drawCountdownOverlay`)
>   resolves a `category:"countdown"` **`BroadcastTheme`** via `resolveTimerTheme`,
>   and `CountdownTimer.themeId` lives in the broadcast namespace; no new-`Theme`
>   Countdown is reachable from the live path until the **Phase 5** migration merges
>   the `themeId` namespaces. The parity gate is the precondition that repoint is
>   measured against — the renderer/timer-element half is ready and proven.
>
> **Remaining for Phase 4 (next increments):**
> - **4c-live (with Phase 5)** — once themes are migrated to the new `Theme` model,
>   repoint the compositor's verse branch to render the presented scripture slide
>   (`presentScripture` → `scriptureContent`) and have `sync.ts` emit `slideUpdate`;
>   migrate paging (`liveVersePages`/`breakPerVerse`) to multi-slide materialization
>   via the mapper. The renderer half (parity) is ready and proven.
> - **4d-live (with Phase 5)** — repoint `drawCountdownOverlay` at a presented
>   Countdown `Theme` (timer-element slide via `presentCountdown` → `themeToSlide`)
>   once `resolveTimerTheme` resolves the new store; retire the
>   `category:"countdown"` → `renderCountdownTheme` path. The timer-element renderer
>   half + parity gate are ready and proven.

- **New** `src/lib/theme/present/` — one mapper per type: `(theme, content) →
  Slide[]`. Scripture fills the scripture placeholder with the pushed verse and
  emits `slideUpdate` (not `verseUpdate`); song fills `role:"lyrics"`; countdown
  needs no content (timer element ticks); overlay composites transparent; sermon/
  announcement are static.
- Migrate verse-only features onto the scripture placeholder / slide path and
  **prove byte-identical** vs `renderVerse` with a parity harness across
  built-ins × verses **before** flipping:
  - auto-fit (`verseAutoFit`/`maxVerseScale`/`minVerseFontSize`,
    `compositor.ts:199`)
  - paging (`liveVersePages`/`breakPerVerse`, `live-transport.ts:359`) →
    multi-slide materialization
  - verse-number styling, reference position/uppercase
  - animated theme backgrounds (`themeAnim`)
  - base/master backdrop (today `paintBaseTheme` calls `renderVerse` with a null
    verse — needs a slide-path equivalent; see decision D1)
- Point the **countdown overlay** at a timer-element theme (retire the
  `category:"countdown"` → `renderVerse` path in `lib/countdown/theme-render.ts`
  / `resolve-theme.ts`). Countdown stays a triggerable **overlay** (a real
  capability); only its *look* moves to the new model.
- Stage display (`stage-display-renderer.ts`) and NDI foreground read the slide
  model.

Verify: parity harness green; live smoke on a real output window + stage + NDI.
Risk: **high** — isolated behind the type gate; verse path stays until parity
holds.

### Phase 5 — Migrate data + delete the old world (largest blast radius, last)

> **Progress (increment 5a — landed, additive, green on all 3 gates):**
> - **The `BroadcastTheme → Theme` bridge exists now** — `src/lib/theme/migrate/`
>   (barrel). This is the keystone whose absence gated 4c-live *and* 4d-live: a pure
>   `broadcastToTheme(bt, newId, now): Theme` that converts identity, resolution,
>   background, decorative elements, transition, and the verse **region → the type's
>   typed placeholder** without data loss.
>   - `background.ts` `backgroundToSlide` — canvas `Background` → `SlideBackground`
>     (gradient `position` 0–100 → `offset` 0–1; image/video objects flattened to
>     `imageUrl`/`videoUrl` + blur/brightness/tint; malformed → solid fallback).
>   - `broadcast-to-theme.ts` — `categoryToType` (song/countdown/sermon/overlay/
>     scripture map through; **`general`/absent → scripture**, since `general` is
>     removed); decorative `ThemeElement[]` (image/shape) → slide elements, px@res →
>     frame-percent, in authored layer order behind the placeholder; `verseText`/
>     `reference` typography → the placeholder (`scripture`/`timer`/`role:"lyrics"`/
>     sermon title+points/announcement title+body); overlay forced transparent, no
>     placeholder; transition mapped (slide→push-l/r, scale→dissolve, none→undefined).
> - **Fidelity is structural, not pixel-parity — by design.** The migrator preserves
>   authored data; byte-identical live *rendering* is the Phase 4 payload gates' job,
>   which the live flips consume. Every built-in broadcast theme migrates to a
>   `validateTheme`-valid `Theme` (placeholder present for its type); tests cover the
>   built-ins grid + background conversion + geometry + transition + deep-copy.
> - **Placeholder geometry** comes from `layout.textAreaWidth/Height` anchored by
>   `layout.anchor` (offsets dropped — they don't survive region→element and aren't
>   consulted by the live scripture payload path, which drives off the payload
>   `style`). Good enough for a data migration; the authoring editor can refine.
> - **Still additive — nothing deleted, no live path repointed yet.** Next: the store
>   ingest (custom `BroadcastTheme`s + `customSlideThemes` → one `themes.json` via the
>   migrator on hydrate), then the `themeId` namespace merge, then the live flips
>   (4c-live/4d-live now unblocked), then the deletions.
>
> **Progress (increment 5b — landed, additive, green on all 3 gates):**
> - **The one-time legacy ingest is wired** — on `hydrateThemes`, both old custom-theme
>   surfaces fold into the new `themes.json` via the migrators, behind a persisted
>   marker so a user's later deletions are never re-imported.
>   - **New** `src/lib/theme/migrate/slide-theme-to-theme.ts` — the sibling of the
>     `broadcast-to-theme` migrator for `presentations.json`'s `customSlideThemes`
>     (`SlideTheme`, song/slide looks). Collapses the multi-variant slide theme to its
>     representative variant (scripture layout for a scripture theme, else content-only
>     → first non-blank → first), lifts background + fresh-id'd elements, and guarantees
>     the type's placeholder by tagging the largest untagged text box `role:"lyrics"`
>     (or synthesising one). `category` → type: song/general → song, scripture →
>     scripture. Pure, deep-copied, tested.
>   - **New** `src/lib/theme/migrate/ingest.ts` — pure `ingestLegacyThemes(sources,
>     existing, newId, now)`; migrates both legacy arrays, drops any record that throws
>     or fails `isValidTheme`, and appends the survivors (fresh ids, no dedup needed)
>     after the existing store themes. Returns `{ themes, added }`.
>   - **Gateway** (`services/theme-store-gateway.ts`) grew the Tauri-side I/O:
>     `loadLegacyThemeSources` (read-only opens of `broadcast-themes.json` +
>     `presentations.json`, never throws) and the `hasIngestedLegacy` /
>     `markLegacyIngested` marker on `themes.json`.
>   - **Store** (`stores/themes/store.ts`) runs `ingestLegacyThemesOnce` inside hydrate,
>     *before* the debounced subscriber attaches, so the ingest write is deterministic;
>     `crypto.randomUUID`/`Date.now()` are injected at this boundary (kept out of `lib`).
> - **Safety:** marker is set even when nothing migrates (fresh install never re-scans);
>   any failure leaves the store untouched and simply retries next boot; a corrupt
>   marker read assumes "ingested" so a double-import can't happen. Tests cover both
>   migrators, the pure ingest (append / fresh-ids / empty / malformed-drop), and the
>   store wiring (first-hydrate ingest+persist+mark; no re-ingest once marked). +13 tests.
> - **Still additive — nothing deleted, no live path repointed yet.** Next: the `themeId`
>   namespace merge (`output-selectors.ts`, `base-theme.ts`, `song-to-slides.ts`,
>   countdown → the one theme store), then the live flips (4c-live/4d-live), then the
>   deletions.
>
> **Progress (increment 5c — id preservation, the namespace-merge prerequisite; additive, green):**
> - **Both migrators now keep the source `id`.** `broadcastToTheme(bt, now)` (the `newId`
>   param is gone — it only ever minted the theme id) uses `bt.id`; `slideThemeToTheme`
>   uses `st.id` for the theme id while still assigning fresh **element** ids. So a
>   migrated custom is addressable by the id its stored references already use
>   (`outputs[].themeId`, `defaultThemeId`, `baseBackground.themeId`, countdown/song
>   `themeId`) — the precondition for those consumers to resolve against the one store.
> - **Tests updated** to assert id-preservation across both migrators + the ingest
>   (legacy ids survive, still no collisions with existing store themes).
> - **Scope honesty — the consumer repoints are genuinely coupled to the live flips.**
>   `output-selectors.resolveThemeId` returns only an id *string*; the theme lookup +
>   render still consume `BroadcastTheme` until 4c-live/4d-live. So repointing resolution
>   to the new store cannot land before the renderer flips without a type mismatch. The
>   other half of id reconciliation — the **built-in alias** (old 14 broadcast/slide
>   built-ins → the 6 new `builtin-<type>` ids; fully mechanical via `categoryToType`) —
>   is deliberately deferred to the flip increment rather than built as dead infra, since
>   nothing consumes an alias until a consumer resolves against the new store.
>
> ---
>
> ## The live flips (4c-live + 4d-live) — phased plan
>
> The remaining work repoints the church-facing render paths off `BroadcastTheme`/
> `renderVerse` onto the typed `Theme` + slide renderer. It is broken into small,
> separately-reviewable phases; the **pure/additive** ones (F1, F2, F4) touch no
> live output and are gated by tests only, while the **live-repoint** ones (F3, F5,
> F6) change what shows on a real projector/stage/NDI and each need a manual live
> smoke before they are considered done. Countdown goes first (smaller blast
> radius); scripture second.
>
> **Open design decisions (defaults chosen; correct me):**
> - **D5 — countdown label.** The old model overlaid a *runtime* `timer.label`; the
>   new countdown `Theme` bakes the label as a **decorative heading text element**
>   ("Service starts in"). Default: the mapper treats the **first non-role text
>   element** as the label slot — a runtime `label` overrides its text, and
>   `showLabel:false` drops it — so an operator's per-timer label still wins while an
>   un-overridden theme shows its authored heading. (Alternative: a dedicated
>   `role:"label"`; rejected as over-modelling for one optional element.)
> - **D6 — per-frame cost.** The themed countdown redraws every RAF frame. `present
>   Countdown` → `themeToSlide` deep-clones the theme per call; per-frame that is
>   allocation in a draw loop (perf rule 1). F3 resolves this by building the
>   presented slide **once** per (theme, timer) and only re-deriving the *time
>   string/colour* per frame (the timer element already recomputes from `now`), or by
>   memoising the slide keyed on theme id + timer id. Measured, not assumed.
>
> **Flip phases:**
> - **F1 (pure, additive) — countdown present model + mapper.** Enrich
>   `CountdownContent` with the live runtime (`remainingSeconds`, `format`,
>   `overtime`, `warnSeconds`, `dangerSeconds`, `label`, `showLabel`);
>   `presentCountdown` element-swaps them onto the timer placeholder and the label
>   slot (D5). Backward-compatible — all fields optional, an empty `{type:
>   "countdown"}` still renders the authored placeholder. Colocated tests. **No live
>   repoint.**
> - **F2 (pure, additive) — id reconciliation + new-store resolver.** The mechanical
>   built-in alias (`legacyThemeIdAlias`: old broadcast/slide `builtin-*` →
>   `builtin-<type>` via `categoryToType`; customs pass through), plus a
>   `resolveCountdownTheme(timer, themes: Theme[])` — the new-`Theme` analogue of
>   `resolveTimerTheme`. Tested. **No live repoint.**
> - **F3 (LIVE — countdown).** Repoint `drawCountdownOverlay`'s themed branch to
>   `presentCountdown(theme)` → `renderSlide` (theme resolved from the new store via
>   F2); flash opacity via a `ctx.globalAlpha` wrap; `operator-overlay-data` +
>   `countdown-store` resolve the new `Theme`. Retire the `renderCountdownTheme` call
>   on the live path (the function stays until the deletions). The 4d parity gate is
>   the correctness reference. **Needs live smoke (output + stage + NDI).**
> - **F4 (pure, additive) — scripture paging materialization.** `presentScripture`
>   exists; add the `liveVersePages`/`breakPerVerse` → multi-slide expansion the
>   compositor needs, proven byte-identical vs `renderVerse` through the existing
>   scripture parity gate. **No live repoint.**
> - **F5 (LIVE — scripture).** Compositor verse branch → render the presented
>   scripture slide + `scriptureContent`; `sync.ts` emits `slideUpdate`;
>   `paintBaseTheme` gets a slide-path equivalent (decision D1: base backdrop = an
>   overlay-type theme). **Needs live smoke.**
> - **F6 (LIVE — consumer id merge).** `output-selectors` fallback + all `themeId`
>   resolution (`base-theme`, `song-to-slides`, countdown) resolve `Theme` from the
>   one store through F2's alias. After F6 the old stores are read-only legacy, ready
>   for the Phase-5 deletions.
>
> **Progress (flip F1 — landed, additive, green on all 3 gates):**
> - `CountdownContent` carries the live runtime; `presentCountdown` element-swaps the
>   timer placeholder (remaining/format/overtime/warn/danger) and the label slot per
>   D5. Colocated tests; no live path touched.
>
> **Progress (flip F2 — landed, additive, green on all 3 gates):**
> - `migrate/legacy-id.ts` — `legacyThemeIdAlias` / `resolveLegacyThemeId`: a map
>   derived at load from the legacy catalogs (old broadcast `BUILTIN_THEMES` + slide
>   `BUILTIN_SLIDE_THEMES`) → the new `builtin-<type>` id via `categoryToType` /
>   `slideCategoryToType`. Custom ids pass through (they were preserved in 5c).
> - `theme/resolve.ts` — `resolveCountdownTheme(timer, themes: Theme[])`, the new-store
>   analogue of `resolveTimerTheme`, resolving through the alias. Tested (by-id,
>   by-alias, custom-style, dangling, wrong-type). No live path touched.
>
> **Progress (flip F3 — LIVE countdown repoint; green on all 3 gates; NEEDS LIVE SMOKE):**
> - The themed countdown overlay now renders through the **slide path**, not
>   `renderCountdownTheme`. `drawCountdownOverlay`'s `theme` is a `Theme`; per timer it
>   builds the presented slide and `renderSlide`s it, wrapping a flash in `globalAlpha`.
> - **Resolution repointed to the one store:** `countdown-store` + `operator-overlay-data`
>   resolve via `resolveCountdownTheme(timer, useThemesStore.allThemes())`; the resolved
>   `Theme` rides the IPC event (`CountdownEntry.theme: Theme` in the gateway) to the
>   output window, which stores + draws it (no store lookup output-side). `overlay-canvas`
>   (operator "Live display") sources themes from `useThemesStore` via `buildThemeRegistry`.
> - **D5 (label) resolved:** `presentCountdown` overrides the first text element with the
>   runtime label (or synthesises a heading above the timer when a *migrated* theme has
>   none), and drops it on `showLabel:false`.
> - **D6 (per-frame cost) resolved:** `broadcast-output/countdown-slide.ts` memoises the
>   structural slide per timer (rebuilt only on theme/label/visibility change) and writes
>   only the live time fields per frame — no `themeToSlide` clone in the RAF loop.
>   `pruneCountdownSlideCache` frees entries for dismissed timers.
> - **Correctness reference:** the 4d countdown parity gate (digit string / urgency colour
>   / label). `renderCountdownTheme` + the old `resolveTimerTheme` remain only for the
>   legacy broadcast-theme *designer* (`design-canvas`), deleted in the Phase-5 tail.
> - **⚠ Live smoke still required** (real output window + operator Live display + NDI):
>   a themed countdown started from the operator, verify digits tick, urgency recolours at
>   warn/danger, label shows (both builtin-heading and migrated-synth cases), flash pulses
>   on expiry, and the operator mirror matches the audience frame.
>
> **Progress (flip F4 — scripture paging materialization; landed, additive, green on all 3 gates):**
> - `present/scripture.ts` grew `presentScripturePages(theme, pages, newId, now)`:
>   maps an **already-resolved** page array (each a `VerseRenderData` split at verse
>   boundaries by the existing `resolveVersePages`/`paginateVerse`) to one
>   `PresentedSlide` per page — so stepping pages steps slides. `presentScripture`
>   now delegates (single-page = `[content.verse]`); one code path. Exported from the
>   present barrel.
> - **Scope kept honest / pure:** the split itself is *not* recomputed here — it's a
>   text-measurement fact the caller resolves against the output's readable floor and
>   hands in already-paged (matching the mapper's original "materialized by the caller
>   per resolved page" contract). This keeps F4 free of the `Theme → verse-style`
>   bridge, which is genuinely F5's (the compositor resolves pages there, against the
>   payload `style`, and calls `presentScripturePages`). `breakPerVerse` needs no
>   materialization — it's a within-slide token-layout flag already reproduced
>   byte-for-byte by the payload delegation (scripture parity gate).
> - **Proven byte-identical:** present.test adds the Theme-side expansion invariants
>   (N pages → N slides each riding its own page verse, loss-free segment round-trip,
>   single-page ≡ `presentScripture`, distinct deep-cloned slides, theme untouched);
>   the scripture parity test adds an F4 case that paginates a real 5-verse block
>   (fake proportional-`measureText` ctx forces a genuine multi-page split) and drives
>   **each page** through `diffScriptureParity` — empty divergences per page — locking
>   that paging introduces no new render path, only more of the same one. +6 tests.
> - **Still additive — no live path repointed.** Next: **F5 (LIVE scripture)** — the
>   compositor verse branch renders the presented scripture slide + `scriptureContent`,
>   `sync.ts` emits `slideUpdate`, and `paintBaseTheme` gets a slide-path equivalent
>   (D1). Needs live smoke.
>
> **Progress (flip F5 — LIVE scripture repoint; green on all 3 gates; NEEDS LIVE SMOKE):**
> - The live scripture verse/reference now renders through the **slide renderer's
>   scripture-payload path**, not `renderVerse`'s own verse pass. The compositor's verse
>   branch (`compositor.ts` `renderVerseContent` + the `composeNdiForeground` verse branch)
>   runs a **two-pass hybrid** via the shared `drawScriptureThemeHybrid`:
>   1. **Chrome** — background + text box + decorative elements — via the *same*
>      `renderVerse(theme, null, …)` pass `paintBaseTheme` already uses (verse/reference
>      regions omitted when the verse arg is null).
>   2. **Verse/reference** — `drawSlideElements` over a style-only scripture placeholder
>      carrying the pushed verse as `scriptureContent` (the payload path proven equal to
>      `renderVerse` by the scripture parity gate).
> - **New** `src/lib/broadcast-output/scripture-slide.ts` (`buildScriptureSlide`, sibling
>   of F3's `countdown-slide.ts`): builds the one-element carrier slide + the
>   `{verse, style, options}` payload map, **memoised on `(theme, verse, auto-fit)`** so the
>   per-frame RAF redraw allocates nothing in steady state (perf rule 1). The carrier is a
>   pure style-only element — the payload path ignores its geometry/typography and lays the
>   verse out against the draw surface from the payload `style` (the `BroadcastTheme`) — and
>   is built from `theme.verseText` for **any** theme category, so a pushed verse always has
>   a carrier (matching `renderVerse`).
> - **Byte-identity proven, not asserted:** `scripture-slide.test.ts` drives the old single
>   `renderVerse(theme, verse)` and the new `renderVerse(theme, null)` + slide-path hybrid
>   through the recording ctx and asserts **position-sorted draw equality** (same text, x/y,
>   font, colour) across every built-in × {single, multi-verse} × {no-autofit, autofit}.
>   Coordinates match exactly because both paths run the identical `computeVerseLayoutMetrics`
>   over the same theme + surface; sorting only absorbs the pixel-invisible verse-vs-reference
>   draw-order swap (disjoint regions). compositor.test gains F5 cases (verse → chrome +
>   `drawSlideElements`; null chrome skips the foreground + runs the black fallback). +~17 tests.
> - **Deliberate deviations from the doc's literal F5 (approved this session — chose the
>   byte-identical, minimal-blast-radius path over the full-slide flip):**
>   - **No wire change.** `sync.ts` still emits `verseUpdate` (BroadcastTheme + verse); the
>     flip lives entirely in the compositor. A full-slide `slideUpdate` would redraw the
>     background through `broadcastToTheme` + `renderSlide` — a path that is **structural,
>     not pixel-parity** (5a) and would risk a visible backdrop change on real output. The
>     hybrid keeps the backdrop byte-for-byte by reusing the exact `renderVerse` chrome pass.
>   - **`paintBaseTheme` / D1 deferred.** It already *is* the byte-identical chrome pass
>     (`renderVerse(base, null)`); converting the base/master backdrop to an overlay-type
>     slide render adds background-parity risk with nothing to prove it. Left for a later
>     increment.
> - **Byte-identity caveat (honest):** the hybrid is byte-identical when the verse/reference
>   are the topmost content layer — true for every built-in (the parity test confirms). A
>   custom theme that layered a *decoration over* the verse would draw that decoration under
>   the verse instead; the verse *content* is unaffected. Acceptable + documented; revisit if
>   a real theme does this.
> - **⚠ Live smoke still required** (real output window + operator + stage + NDI): push a
>   verse, confirm it renders identically to before (auto-fit, paging via next/prev page,
>   per-verse breaks, verse numbers, reference format), on both the opaque program frame and
>   the keyed NDI foreground; confirm transparent verse themes still composit over the base.
> - **Remaining:** **F6 (LIVE consumer id merge)** — `output-selectors` fallback + all
>   `themeId` resolution resolve `Theme` from the one store via F2's alias; then the old
>   stores are read-only legacy, ready for the Phase-5 deletions.
>
> ---
>
> ## The renderer Theme-object flip (precedes F6) — RF1…RF4
>
> **Why this exists.** Mapping F6 revealed it can't land cleanly: the live scripture/base/
> stage path is still `BroadcastTheme`-typed end-to-end (store `s.themes` → `sync.ts` wire →
> compositor `renderVerse`; F5 only moved the verse *body* draw, not the theme *type*).
> Aliasing a stored id before the **old**-store lookup breaks it (an aliased `builtin-<type>`
> id isn't in `s.themes`), and flipping consumers to the new store changes built-in looks
> (14+N old builtins → 6 new). So F6 is blocked on the renderer consuming the new `Theme`.
>
> **Reframed correctness bar (decided this session).** This flip **cannot** be byte-identical
> — the new scripture placeholder is intentionally leaner than `BroadcastTheme`, and built-in
> *looks* becoming the 6 new designs is the clean-slate intent. The gate is now **feature
> preservation** (verse numbers, per-verse breaks, reference position/uppercase, auto-fit,
> paging all still render), proven by tests; custom themes are migrated faithfully.
>
> **Staging:** **RF1** (pure/additive) enrich the placeholder to be the verse-style source ·
> **RF2** (LIVE) flip `sync`+compositor onto the new store, retire `renderVerse` on the live
> path, base backdrop → new Theme (D1) · **RF3** (LIVE) stage display + operator previews ·
> **RF4** F6 id-merge (now trivial) + Phase-5 deletions.
>
> **Progress (RF1 — landed, additive, green on all 3 gates; +5 tests):**
> - **`SlideScriptureElement` enriched** (`types/slide.ts`) with the verse styling the lean
>   placeholder lacked — all **optional**, backward-compatible (flows to `SlideThemeElement`
>   via its `Omit<…>`): `verseNumbers`, `referenceUppercase`, `referencePosition`,
>   `breakPerVerse`, `textTransform`, `letterSpacing`, `textBox`.
> - **Migrator no-loss** — `broadcastToTheme`'s `scripturePlaceholder` now copies those from
>   the `BroadcastTheme` (`verseNumbers`, `reference.uppercase/position`, `layout.breakPerVerse`,
>   `verseText.textTransform/letterSpacing`, `textBox`), so migrating a custom verse theme
>   no longer drops its verse styling.
> - **New** `src/lib/slide-renderer/scripture-style.ts` — `scriptureElementToVerseStyle(el):
>   BroadcastTheme` rebuilds the verse-render `style` (the transitional carrier
>   `ScriptureRenderPayload.style`) from the placeholder alone: the element **box** becomes
>   the verse text area (top-left anchor + offset at a 1920×1080 reference resolution, so at
>   16:9 the area *is* the box and the verse renderer's surface projection reflows it
>   elsewhere), and the enriched fields fill verse numbers / reference format / breaks / body
>   transform+tracking. Reference reuses the body font family (the placeholder — like the
>   migrator before it — carries no separate reference face); **feature-preserving, not
>   pixel-parity**, by the reframed bar.
> - **Proven:** `scripture-style.test.ts` — adapter field mapping + defaults, migrator no-loss
>   across built-ins, and an **enrich → migrate → adapt round-trip** driving `renderVerse` with
>   the original `BroadcastTheme` vs the rebuilt style and asserting the **verse body (transform
>   included), reference label (uppercase/format), and verse-number tokens** match across every
>   scripture built-in × {single, multi-verse}. Geometry/wrapping may differ (not asserted).
> - **Still additive — no live path touched.** Next: **RF2 (LIVE)** — `sync.ts` resolves a
>   `Theme` (via F2 alias) from `useThemesStore` and the compositor renders chrome via
>   `renderSlide` + verse via the placeholder-sourced payload (`scriptureElementToVerseStyle`),
>   retiring `renderVerse` from the live path; base backdrop → new Theme (D1). Needs live smoke.
>
> **Progress (RF2 — LIVE scripture repoint onto the new store; green on all 3 gates; NEEDS LIVE SMOKE):**
> - **Live scripture now resolves from the new typed store and renders through the slide
>   renderer.** Chosen implementation: route a live verse through the **existing slide path**
>   (emit `slideUpdate` carrying the verse) rather than change the `verseUpdate` wire type —
>   lowest blast radius, and it reuses the whole slide pipeline (asset preload, animated
>   backgrounds, transitions, NDI, transparent-over-base compositing) unchanged.
>   - **`sync.ts`** live-verse branch: resolves the output's theme in `useThemesStore.allThemes()`
>     via `resolveScriptureTheme` (F2 alias; falls back to the scripture built-in), presents the
>     pushed verse with `presentScripture` (stable id `"live-scripture"`, transition stripped so
>     verses swap instantly), and emits it as a `slideUpdate { slide, verse, layerFilter }`.
>     Idle/not-live still emits `verseUpdate { theme: BroadcastTheme, verse: null }` (the theme
>     backdrop) and stage/designer are untouched — so nothing else regresses.
>   - **`SlideUpdatePayload.verse?`** (gateway) carries the live verse alongside the presented
>     slide (plain, serialisable). `CompositorState.latestSlide` gains `verse?`.
>   - **`buildScriptureContent(slide, verse, auto-fit)`** (`scripture-slide.ts`, memoised): builds
>     the `scriptureContent` payload map from the slide's scripture placeholder — its `style`
>     rebuilt from the placeholder's own RF1 styling via `scriptureElementToVerseStyle`, **no
>     pushed BroadcastTheme**. `buildSlideRenderOpts` threads it into `renderSlide` /
>     `drawSlideElements` for both the program frame and the keyed NDI foreground.
> - **`renderVerse` is off the primary live scripture render** — a pushed verse now draws through
>   `renderSlide` + the payload path. `renderVerse` remains only for the **idle backdrop** and the
>   legacy designer preview (retired with the verse renderer in Phase 5 / D3). New resolver
>   `resolveScriptureTheme` (`lib/theme/resolve.ts`) is the scripture analogue of
>   `resolveCountdownTheme`.
> - **Feature-preservation proven** by the RF1 round-trip gate (verse numbers, reference
>   format/uppercase, per-verse breaks, transform) + `buildScriptureContent` unit tests +
>   updated broadcast-store sync tests (a live verse emits a presented scripture `slideUpdate`).
>   Built-in *looks* now become the 6 new designs (the accepted redesign).
> - **Deferred within RF2 (kept small, lower risk):** the **base backdrop** (D1) stays on the
>   `renderVerse(base, null)` path — the `baseTheme` wire + resolution are unchanged — rather than
>   flipping it to a new-Theme slide render in the same increment. Fold into RF3.
> - **⚠ Live smoke required** (real output + operator + NDI): push verses and confirm the verse,
>   numbers, reference (position/uppercase), per-verse breaks, auto-fit, and **paging (next/prev
>   page)** all render on the audience frame and the keyed NDI foreground; confirm transparent
>   scripture themes still composit over the base; confirm idle (no verse) still shows the backdrop.
>   **Known gap until RF3:** the operator's own *preview* still renders scripture the old way
>   (`renderVerse`/BroadcastTheme), so it won't visually match the output's new design until the
>   operator previews are repointed.
> - **Next: RF3** — repoint the base backdrop (D1) + stage display + operator previews onto the
>   new `Theme`; then **RF4** (F6 id-merge, now trivial) + the Phase-5 deletions.
>
> **Progress (RF3a — base backdrop / D1 onto the slide path; green on all 3 gates; NEEDS LIVE SMOKE):**
> - The central base/master backdrop is now a typed **`Theme`** painted through the slide
>   renderer, not a `BroadcastTheme` via `renderVerse(bt, null)`.
>   - **New** `resolveBaseTheme` in `lib/theme/resolve.ts` (new-model sibling of
>     `lib/broadcast/base-theme.ts`): `null` → output theme; `kind:"theme"` → aliased lookup
>     (any type); `kind:"background"` → a background-only `Theme` (id `"base-background"`,
>     `backgroundToSlide`, no elements). `sync.ts` resolves the output theme in
>     `useThemesStore` and emits `baseTheme { theme: Theme }`.
>   - **`paintBaseTheme`** (compositor) renders `buildBaseSlide(theme)` (memoised `themeToSlide`)
>     via `renderSlide` (opaque) / `drawSlideElements` (transparent-over-media). `BaseThemePayload.theme`,
>     `CompositorState.baseTheme`, and `runtime.baseThemeRef` are all `Theme` now.
>   - **New** `preloadSlideAssets` (`asset-cache.ts`) — the slide-model asset preloader; the
>     base-theme listener uses it (`preloadBaseThemeImages`). Animated/video base detection reads
>     `SlideBackground.type` (same union).
>   - **Cross-namespace dedupe:** the idle backdrop is still a legacy `BroadcastTheme` (verseUpdate),
>     so the "base differs from this theme" checks (compositor `renderVerseContent`, runtime NDI
>     `hasOpaqueBaseTheme`) alias the legacy id via `resolveLegacyThemeId` before comparing.
> - Tests: `resolveBaseTheme`/`resolveScriptureTheme` (resolve.test), `preloadSlideAssets`
>   (asset-cache.test), `buildBaseSlide` (scripture-slide.test), updated broadcast-store base-theme
>   emit (alias-resolved id) + compositor base ops (`renderVerse(base)` → `renderSlide(base)`). +10.
> - **⚠ Live smoke:** Clear + transparent scripture/slide over the base backdrop render the new base
>   design (background + branding); animated/video base backgrounds animate; base override
>   (`kind:"theme"`/`kind:"background"`) applies. Built-in base looks become the new designs.
> - Remaining in RF3: **RF3b (stage)** — present live verses as slides in `syncStageOutput` +
>   `renderContentPreview`; **RF3c (operator previews)** — `CanvasVerse` + `ScheduleItemThumbnail`
>   scripture case onto the slide path (closes the operator preview-vs-output gap).
>
> **Progress (RF3b — stage display onto the slide path; green on all 3 gates; NEEDS LIVE SMOKE):**
> - `syncStageOutput` (sync.ts) now presents a live verse as a scripture slide (mirroring the
>   audience path), passing it as `currentSlide` with the verse on `currentVerse` **only for the
>   presented scripture slide** (that flag tells the renderer to fill it). A real schedule slide
>   takes precedence; no scripture theme resolvable → the verse falls back to the legacy path.
> - `renderContentPreview` (stage-display-renderer.ts): a slide-with-verse fills its placeholder
>   via `buildScriptureContent` + `renderSlide` (auto-fit off, matching the stage's prior
>   `renderVerse`); a plain slide renders as-is; the `renderVerse` branch remains only as the
>   no-scripture-theme fallback. So the stage mirrors the audience's RF2 slide-presented scripture.
>
> **Progress (RF3c — operator previews onto the slide path; green on all 3 gates; closes the preview gap):**
> - **New** `ScripturePreview` (`components/ui/scripture-preview.tsx`) + `BasePreview`
>   (`base-preview.tsx`): resolve the scripture / base `Theme` from `useThemesStore` (via the
>   alias), present + draw through `SlideCanvas` — the operator analogue of the compositor's
>   RF2/RF3a render. `SlideCanvas` gained an optional `scriptureContent` prop (threaded into
>   `renderSlide`).
> - Repointed the live scripture + Clear previews in **`live-output-panel.tsx`** and the scripture
>   preview in **`preview-panel.tsx`** off `CanvasVerse`/`resolveBaseTheme` (legacy `renderVerse` +
>   `BroadcastTheme`) onto the new components; and the **`ScheduleItemThumbnail`** scripture case
>   off inline `renderVerse` onto `presentScripture` + `renderSlide` + a scripture payload. So the
>   operator preview now matches the audience output (the RF2 gap is closed). `CanvasVerse` remains
>   for the theme-**design** surfaces (they still author `BroadcastTheme`s until Phase 5).
> - Pure UI re-wiring over already-tested render logic (RF1/RF2 + scripture-slide/parity suites);
>   no new tests, per CLAUDE.md's UI-re-render allowance — the full suite stays green.
> - **⚠ Live smoke:** operator live monitor + preview panel + schedule thumbnails render scripture
>   identically to the audience output (numbers, reference, breaks, auto-fit); Clear shows the new
>   base backdrop.
> - **RF3 complete.** Next: **RF4** — F6 id-merge (`output-selectors` fallback + remaining `themeId`
>   resolution onto the one store; now trivial since the live consumers already resolve there) +
>   the Phase-5 deletions (`verse-renderer`, fixed-slot designer, `BroadcastTheme`, dual persistence).
>
> ---
>
> ## Verse-renderer engine retirement (VR1…VR4) — the Phase-5 unblocker
>
> **Why:** the Phase-5 deletions were blocked because `verse-renderer` + `BroadcastTheme` are still
> the live scripture *engine*: `scriptureElementToVerseStyle` produced a `BroadcastTheme` that the
> verse draw passes (`computeVerseLayoutMetrics`/`drawVerseText`/`drawReference`) consume. Decoupling
> those passes from `BroadcastTheme` is the keystone.
>
> **Key finding:** the draw passes read only **6** `BroadcastTheme` fields — `resolution`, `verseText`,
> `verseNumbers`, `reference`, `layout`, `textBox` (no `elements`/`background`/`id`/`transition`). So
> the decouple is a **type-narrowing**, not a logic rewrite.
>
> **Progress (VR1 — decouple the verse engine from BroadcastTheme; green on all 3 gates; byte-identical):**
> - New type `VerseStyle = Pick<BroadcastTheme, "resolution"|"verseText"|"verseNumbers"|"reference"|"layout"|"textBox">`
>   (types/broadcast.ts). A full `BroadcastTheme` is structurally a `VerseStyle`.
> - Narrowed the draw passes (`layout.ts`, `verse-text.ts`, `verse-tokens.ts`, `text-style.ts` — incl.
>   `computeVerseLayoutMetrics`, `drawVerseText`, `drawReference`, `buildScaledTheme`,
>   `projectThemeToSurface`, `VerseLayoutMetrics.scaledTheme`) from `BroadcastTheme` → `VerseStyle`.
>   `renderVerse`/`renderVerseImpl` keep their `BroadcastTheme` (they draw background + decorations);
>   the scaler spreads `...theme` so `scaledTheme` retains `background` at runtime — one documented
>   cast at the `drawBackground` call bridges it. So idle/designer/`CanvasVerse` are untouched.
> - `scriptureElementToVerseStyle` now returns a **`VerseStyle`** (drops the dummy id/background/
>   transition it used to fabricate); `ScriptureRenderPayload.style: VerseStyle`. **The live scripture
>   render no longer references `BroadcastTheme` anywhere.**
> - Byte-identical: same draw code, proven by the scripture parity gate; the RF1 round-trip test now
>   renders the reconstructed `VerseStyle` through the **slide payload path** (its only consumer) and
>   still matches `renderVerse(bt)` on verse body/numbers/reference across every built-in.
> - **Remaining (VR2–VR4):** VR2 move the (now VerseStyle-based) engine files into `slide-renderer`;
>   VR3 flip the last `BroadcastTheme` consumers (idle backdrop, song schedule) onto the new store;
>   VR4 delete `renderVerse`, `BroadcastTheme`, `convert.ts`, category enums, dual persistence, and the
>   fixed-slot designer (once Phase-3 authoring replaces it). VR1 unblocks all of it.
>
> **Progress (VR3 — flip the last live theme consumers; green on all 3 gates; NEEDS LIVE SMOKE):**
> - **Idle backdrop** — sync's not-live + live-no-verse emits now send the output theme's backdrop as a
>   `slideUpdate` (`themeToSlide(outputTheme)`, transition stripped, no `verse`) instead of the legacy
>   `verseUpdate`/`renderVerse`. Fixes a real inconsistency introduced in RF3c: the operator idle preview
>   was already on the new design, but the output-window idle still used `renderVerse`/`BroadcastTheme` —
>   now both render the new backdrop. Fallback to the legacy verse path only if no theme resolves.
> - **Song schedule** — `generateSlidesFromSong` resolves a **song `Theme`** from the new store
>   (`resolveSongTheme` + the legacy-id alias; built-ins via `NEW_BUILTINS` + injected customs) instead of
>   a `SlideTheme` via `resolveThemeSlideContent`. Background + lyric typography come from the theme's
>   `background` + its `role:"lyrics"` text element (single-slide model — blanks reuse the background).
>   All 6 callers repointed from `usePresentationStore.customSlideThemes` → `useThemesStore.customThemes`.
>   The ~26-case golden suite: structure tests are theme-agnostic (unchanged); the 3 theme-value tests
>   now use new `Theme` custom fixtures. **This is the `SlideTheme`/dual-persistence cleanup track**, not
>   the `BroadcastTheme` retirement — every song's built-in look becomes the new song design.
> - **⚠ Live smoke:** live (no verse pushed) shows the new idle backdrop matching the operator preview;
>   song schedule/preview/thumbnails generate lyric slides with the new song theme's look; a custom song
>   theme (once authoring lands) drives its background + lyric typography.
> - **Remaining for deletion (VR4):** the only live `BroadcastTheme`/`renderVerse` consumers left are the
>   **fixed-slot designer** (theme authoring) + `CanvasVerse` design surfaces — deletable only once
>   **Phase 3** (type-first authoring editor) replaces them. That, not VR3, is the true gate on the
>   Phase-5 deletions.
>
> **CORRECTION (discovered later — the note above is stale): Phase 3 is ALREADY DONE.** The type-first
> authoring editor was built back in commit `c49819b` (Phase-1 era) and is committed on `theme-refactor`:
> `theme-library.tsx` (New ▾ → 6 types, no category `<Select>`), `lib/theme/templates/` (6 seed
> templates + `createThemeFromTemplate`), `theme-designer.tsx` (embeds `PresentationEditor` in
> `themeMode`, single top bar, unsaved-changes guard), and `editor/theme-properties/` (6 typed panels +
> router). The legacy fixed-slot designer was already unreachable (orphaned), so VR4 was NOT blocked on
> Phase 3. **Phase 3 has not had a live hardware smoke test** (a "Maximum update depth" crash was reported
> opening the designer earlier; the current `theme-designer.tsx` has no render-phase setState so it may be
> resolved — unverified on real hardware).
>
> **VR4 deletion — consumer graph mapped; staged in leaf-first waves (each green on all 3 gates):**
> - **Wave 1 (DONE — commit `126a577`):** deleted the orphaned fixed-slot designer cluster — `design-canvas`,
>   `properties-panel` + `background-properties/`, `theme-format-toolbar`, `element/text/layout/transition-properties`,
>   `theme-layer-list`, `theme-canvas-overlay/`, orphaned `theme-library/theme-card` + `slide-theme-thumbnail`,
>   `use-theme-regions`, `canvas-editor/workspace-geometry`. 27 files; no runtime path changed.
> - **Wave 2 (DONE — commit `7e1fd58`):** deleted the interim `UnifiedTheme` container + adapters —
>   `lib/theme/convert.ts`, `lib/theme/builtin-themes.ts`, `UnifiedTheme`/`ThemeKind` from `types/theme.ts`,
>   stale barrel re-exports. `types/theme.ts` is now just the type-first `Theme` model.
> - **Wave 3 (PENDING — LIVE repoints, need smoke tests):** three blockers, each a repoint then a delete:
>   - **A — CanvasVerse in verse-edit modals.** Repoint `verse-edit-modal.tsx:268` + `multi-verse-edit-modal.tsx:250`
>     off `CanvasVerse` onto the slide-renderer preview; then delete `components/ui/canvas-verse.tsx`.
>   - **B — audience + stage still call `renderVerse` (the F5 hybrid chrome pass).** Repoint `compositor.ts`
>     (`renderVerse(theme,null)` chrome) + `stage-display-renderer.ts` onto a slide-renderer chrome path; then
>     delete `verse-renderer/index.ts` (`renderVerse`) + `background.ts` + `project-element.ts`. **KEEP**
>     `verse-renderer/{layout,verse-text,verse-tokens,text-style}.ts` — live infra reused by
>     `slide-renderer/text-drawing.ts` + `verse-pagination.ts` (relocate under `slide-renderer/` later).
>   - **C — legacy `customSlideThemes` (presentation store).** Repoint `slide-theme-picker.tsx:62`,
>     `song-projection-options.tsx:71`, `songs-section.tsx:26` → `useThemesStore.customThemes`; then delete the
>     slice + `presentations.json` persistence of it.
> - **Wave 4 (PENDING — after B+C):** retire the legacy broadcast store (`theme-crud`, `theme-designer` slice,
>   `broadcast-store` hydrate/persist, `main.tsx` `hydrateBroadcastThemes`); delete `lib/builtin-themes.ts`
>   (`BUILTIN_THEMES`), `BroadcastTheme` + `ThemeCategory` types, `types/index.ts` export; delete `migrate/**` +
>   legacy read paths once no user needs the one-time ingest. **Keep** `SlideThemeCategory` (live slide model).
> - **Safety net kept until Wave 3:** `countdown/theme-render.ts` + the `present/parity/**` harness stay (they're
>   the byte-identity gate for the still-live `renderVerse` path); delete them with Wave 3/4 once the slide path is
>   trusted.
>
> **Original plan for Phase 5:**

- **New** `src/lib/theme/migrate/` — one-time: existing custom `BroadcastTheme`s
  → `Theme{type:"scripture"}` (regions → scripture placeholder + elements → slide
  elements + background); existing `customSlideThemes` → `Theme{type:"song"}`.
  Schema bump on hydrate; tested over a grid of built-ins + representative
  customs.
- Merge the `themeId` namespaces (`output-selectors.ts`, `base-theme.ts`, song
  schedule `song-to-slides.ts`, countdown) into the single theme store lookup.
- Delete `verse-renderer/*`, the fixed-slot designer, `UnifiedTheme`/`convert.ts`,
  category enums, dual persistence, `BroadcastTheme` (~60-file blast radius).
- Repoint `CountdownTimer.themeId` to the new theme store.

Verify: migration tests (old JSON → new themes); full suite; live smoke across
all types. Risk: high — everything before it exists to make this safe.

---

## 6. Decisions still open (pre-answered with recommendations)

- **D1 — Base/master backdrop.** Recommend: a base backdrop becomes an
  **Overlay-type theme with no foreground content** (or a dedicated
  `background`-only theme), rendered through the slide path — no special verse
  backdrop. Confirm before Phase 4.
- **D2 — Scripture fill: element-swap vs binding.** Recommend **element-swap**
  (fill the scripture placeholder's text at go-live) — matches today, least risk;
  `role` markers cover song/sermon/announcement text.
- **D3 — Verse renderer.** Recommend **delete after parity** (Phase 5); it's a
  tuned hot path, but keeping two renderers is the thing we're removing.
- **D4 — Song schedule `themeId`.** Recommend it resolves to a `Theme{type:
  "song"}` from the one store (Phase 5 namespace merge).

## 7. Feature-parity checklist (must survive Phase 4)

- [ ] Auto-fit / shrink-to-region  · [ ] Verse paging / per-verse breaks
- [ ] Verse-number styling · [ ] Reference position/uppercase
- [ ] Animated backgrounds · [ ] Base/master backdrop compositing
- [ ] Transitions · [ ] Stage display · [ ] NDI foreground

## 8. Sequencing

Phase 0 now (optional, stops the bleeding). Then 1 → 2 → 3 deliver the type-first
authoring experience end to end (new model, timer, builders) without touching
live rendering. Phase 4 only once the parity harness exists. Phase 5 (migrate +
delete) last, incrementally. Each phase is PR-sized, green on all three gates,
decoupled modules with colocated tests.
