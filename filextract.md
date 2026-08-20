# File Extraction Plan — Tier A, Tier D, and pptx-import

Phased plan to break up the codebase's largest files. Every phase is
**behavior-preserving**: no feature changes, no output changes. The gate for
each phase is the CLAUDE.md gate — `npm run typecheck && npm run lint && npm test`
all clean — plus, where output could shift, a **parity test** proving the new
path equals the old byte-for-byte.

## Guiding rules (from CLAUDE.md)

- **Decompose, don't rewrite.** Move code; don't change it. If a function's body
  changes at all, that's a separate follow-up, not part of the split.
- **Layering is preserved, not introduced here.** These files already obey the
  layering rules (logic in `lib/`, IPC in `services/`). This work is about
  file size / cohesion, not moving logic across layers — with two exceptions
  called out below (drop helpers → `lib/`, store slices).
- **Folder-per-domain with a barrel `index.ts`** where it helps (the pattern the
  refactor already set: `lib/verse-renderer/`, `lib/slide-renderer/`).
- **Keep public import paths stable.** When a file becomes a folder, add
  `index.ts` re-exporting the same names so no call site changes in the same PR.
- **One file per PR/commit.** Each numbered phase is independently landable and
  independently revertable.
- **No `.md` committed** (repo rule) — this file is planning scratch.

## Sequencing across tiers

Order chosen for lowest risk first (mechanical, well-tested) → highest
coordination last (stores touched by many callers):

1. **pptx-import** (Phase P) — pure `lib/`, already well-factored internally,
   guarded by an existing parity-capable test. Lowest risk; validates the
   folder-split playbook.
2. **Tier A components** (Phases A1–A9) — independent files, mostly pure
   component extraction. Ordered by value (tangled concerns first).
3. **Tier D stores** (Phases D1–D2) — highest blast radius (many subscribers);
   done last, slice-by-slice.

Each tier below is self-contained; phases within a tier can be reordered freely.

---

## Phase P — `lib/pptx-import.ts` (1045 lines) → `lib/pptx-import/`

**Why:** irreducible OOXML domain complexity in one cohesive unit. Not tangled —
just long. Textbook folder-with-barrel candidate. Pure mechanical extraction.

**Target layout:**

```
lib/pptx-import/
  index.ts        ← parsePptx (public entry) + buildSlideContext orchestration
  xml.ts          ← parseXml, childrenByTag, firstDesc, firstChild, readXml
  geometry.ts     ← Xfrm, readXfrm, emuToPct, ptToPx, rectFromXfrm, readRot
  colors.ts       ← ThemeColors, clamp8, toHex, applyLumMods, resolveColor,
                    resolveScheme, readLum, parseThemeColors, parseClrMap
  rels.ts         ← parseRels, resolvePath, relsPathFor, findByType
  text.ts         ← RunStyle, ALIGN_MAP, ExtractedText, extractText,
                    paragraphBullet, emptyStyle, readRunStyle
  placeholders.ts ← PlaceholderMap, buildPlaceholderMap, resolvePlaceholderXfrm,
                    TxStyle, TxStyleMap, lvl1DefStyle, parseTxStyles, txStyleFor
  groups.ts       ← GroupTransform, IDENTITY_TF, applyTransform,
                    composeGroupTransform
  background.ts   ← BgResult, materializeBg, resolveBg, bgResultFromDoc,
                    parseGradient
  slide.ts        ← SlideContext, PendingImage, parseSlide, walkTree,
                    parseShape, parsePicture
```

**Dependency direction (must stay acyclic):**
`xml` ← everything; `geometry`, `colors`, `rels` are leaves; `text`,
`placeholders`, `background`, `groups` depend on those; `slide` depends on all;
`index` composes `slide` + `rels` + `colors` + `placeholders` + `background`.

**Steps:**
1. Create `lib/pptx-import/xml.ts`, `geometry.ts`, `colors.ts`, `rels.ts` (the
   leaves) — move functions verbatim, export them.
2. Create `text.ts`, `placeholders.ts`, `groups.ts`, `background.ts` — move,
   importing from the leaves.
3. Create `slide.ts` — move `parseSlide`/`walkTree`/`parseShape`/`parsePicture`
   and the `SlideContext`/`PendingImage` interfaces.
4. Replace `lib/pptx-import.ts` with `lib/pptx-import/index.ts` holding
   `parsePptx` + `buildSlideContext`, re-exporting `parsePptx` and the
   `ImageResolver` type (the only names imported externally — verify via grep).
5. Keep the module specifier `@/lib/pptx-import` resolving to the folder's
   `index.ts` so `pptx-import-runner.ts` and `pptx-fonts.ts` are untouched.

**Guardrail:** the existing `pptx-import` test suite is the parity net. Before
starting, confirm it exercises a real `.pptx` fixture end-to-end; if it only
unit-tests helpers, **add a golden-output test first** (parse a fixture →
snapshot the resulting `Presentation` JSON with image bytes stubbed) so the
split is provably output-identical. Colocate new unit tests next to each new
module opportunistically, but the golden test is the non-negotiable gate.

**Risk:** low. **Value:** medium (navigability only; already well-factored).

---

## Tier A — Component monoliths

Common playbook for every Tier A phase:

- Extract each sub-component into its own file under a domain subfolder
  (`components/<domain>/<feature>/`), keeping the **exported** component's name
  and import path stable (via the folder `index.ts` or by leaving the top-level
  file as the shell that composes children).
- **Module-scope helper functions that are business logic move to `lib/`**, not
  to a sibling component file. (E.g. schedule drop routing.) Pure
  render/local-state stays with the component.
- Shared types used across the split go to a local `types.ts` or `src/types/**`
  if broadly shared.
- **No parity test needed for pure UI re-render/subscription-preserving moves**
  (CLAUDE.md allows relying on the existing suite for these) — but say so
  explicitly in the PR, and keep selectors/memoization identical so you don't
  silently regress a hot path.

### Phase A1 — `schedule-panel.tsx` (1463 lines) — highest value

Three unrelated components + module-scope drop helpers in one file.

**Target:**
```
components/schedule/
  schedule-panel.tsx        ← shell: PanelHeader, tabs wiring, dialogs (~250 ln)
  tabs/schedule-all-tab.tsx ← ScheduleAllTab (the big list/grid, DnD, transport)
  tabs/ai-verses-tab.tsx    ← AIVersesTab
lib/
  schedule-drop.ts          ← addVersesToSchedule, addVersesToQueue,
                              handleScheduleDrop (pure routing over store state)
```
- `ScheduleSongsTab` already lives in its own file — leave it.
- Move the module-scope drop helpers to `lib/schedule-drop.ts` (they operate on
  `useScheduleStore.getState()` / `useQueueStore.getState()` — already
  store-orchestration, not React). Colocate `schedule-drop.test.ts`.
- The Export/Import handlers added recently stay in the shell (they're wiring).

**Steps:** (1) extract `lib/schedule-drop.ts` + test; (2) extract
`ai-verses-tab.tsx`; (3) extract `schedule-all-tab.tsx` (largest — move its
local state, DnD pointer handlers, and effects wholesale); (4) reduce
`schedule-panel.tsx` to the shell. Gate after each.

**Risk:** medium (DnD pointer logic + keyboard effects are fiddly). **Value:** high.

### Phase A2 — `panels/live-output-panel.tsx` (1145 lines)

3 components. Split each into `components/panels/live-output/` and reduce the
top file to the composition shell. Watch for per-frame/hot-path subscriptions —
preserve narrow selectors exactly.

### Phase A3 — `broadcast/output-manager.tsx` (807 lines)

3 components. IPC is already via gateways (`onOutputReady` etc. — verified, no
inline `invoke`). Split into `components/broadcast/output-manager/` shell +
children. Pure component extraction.

### Phase A4 — `broadcast/theme-canvas-overlay.tsx` (778 lines)

Overlay + editing UI. This touches the **per-frame canvas hot path** — any
extraction here must keep the RAF loop, offscreen-canvas reuse, and
`measureText` caching byte-identical. **Requires a parity/render test** if the
draw path is refactored at all; if it's a pure component split with the draw
code moved verbatim, note that explicitly. Higher care than A2/A3.

### Phase A5 — `broadcast/background-properties.tsx` (736 lines)

One very large property form. Split by control group (e.g. fill / gradient /
image / effects sub-panels) into `components/broadcast/background-properties/`.
Watch the **debounced-undo gesture** pattern (`UNDO_DEBOUNCE_MS` + `lastUndoPush`)
— keep it intact across the split; sliders/color-pickers must still record one
undo snapshot per gesture.

### Phase A6 — `panels/search-panel.tsx` (685 lines)

A single monolithic component (not multi-component). Extraction is by
**responsibility within one component**: pull leaf rows/result items into memo'd
subcomponents and hoist pure helpers to `lib/search/` (which already exists).
This is the one Tier A file where the win is `React.memo` leaf extraction for
re-render perf, not just line count. Keep selectors narrow.

### Phase A7 — `countdown/countdown-trigger.tsx` (662 lines)

Trigger + config UI. Split config form into
`components/countdown/countdown-config.tsx`; any countdown math already belongs
in `lib/countdown/` — move stragglers there. Note: this file was recently
modified (theme-render work) — rebase carefully.

### Phase A8 — `broadcast/theme-library.tsx` (653 lines)

Library grid + item UI. Extract the item/card component; library shell stays.

### Phase A9 — (stretch) revisit any remaining 600+ files after A1–A8

Re-measure; some may drop below threshold once shared helpers move to `lib/`.

**Tier A risk ranking:** A4 (hot path) > A1 (DnD) > A5 (undo/forms) > rest
(straight component extraction).

---

## Tier D — Store decomposition (slice extraction)

The stores orchestrate; they already delegate real logic to `lib/`. The size is
**too many orchestration methods in one `create()`**. The established pattern is
the broadcast store's slice split (`stores/broadcast/sync.ts` via
`StateCreator` slices). Replicate it. **Highest blast radius** — every subscriber
imports the store hook — so keep the hook's name, shape, and selector semantics
identical.

### Phase D1 — `stores/presentation-store.ts` (921 lines)

**Approach:** carve cohesive method groups into slice creators under
`stores/presentation/`, combined in the root store the way `broadcast/` is:
```
stores/presentation/
  index.ts        ← create() combining slices; hydration/persistence
  <slice>.ts      ← e.g. draft-editing, history/undo, theme, selection slices
```
- Candidate slices: **history/undo** (the `structuredClone` + `UNDO_DEBOUNCE_MS`
  logic), **draft element mutations** (`updateDraftElementsBatch` etc. — the
  batched-rebuild hot path), **theme/customSlideThemes**, **selection/lifecycle**.
- Real mutation logic should already be in `lib/presentation/*` (history.ts,
  slide-mutations.ts) — the slice just orchestrates. If any real logic is still
  inline, **move it to `lib/` as part of the slice extraction** (this is the one
  place Tier D also does a small layering cleanup).

**Guardrail:** the store's existing test suite + a **parity test** on undo/redo
and batch-edit output (snapshot presentation state across a scripted sequence of
mutations, old store vs. new) — because these are hot paths where output must
stay byte-identical.

**Steps:** (1) extract the leaf-most slice (theme) to prove the wiring; (2)
extract history/undo with its parity test; (3) extract draft-mutation slice
(most care — hot path); (4) leave persistence/hydration in `index.ts`. Gate
after each slice.

### Phase D2 — `stores/schedule-store.ts` (736 lines)

**Approach:** same slice pattern under `stores/schedule/`:
- **item CRUD** (add/insert/remove/clear/update/reorder + dedupe),
- **navigation/presentation** (`goToItem`/`nextItem`/`prevItem`/`presentLive`/
  `presentItem` + the `deckForSongItem` helper — heavy, pulls in many stores),
- **schedule CRUD** (create/import/delete/rename/duplicate),
- **persistence/hydration** (tauri-plugin-store) in `index.ts`.
- Consider moving `deckForSongItem` and `setStageNotesForItem` to
  `lib/schedule/` (they're pure-ish orchestration over other stores' state) —
  optional, only if it doesn't create an import cycle.

**Guardrail:** existing `schedule-store.test.ts` + coverage for the recently
added `importSchedule`. No output-format change; the parity concern is limited
to navigation index bookkeeping (`activeItemIndex` restoration) — add a scripted
next/prev test if not already present.

**Tier D risk:** high (subscribers everywhere). Mitigation: the folder `index.ts`
exports the **same** `useXStore` hook; do the split with zero call-site edits,
verified by the full suite passing untouched.

---

## Definition of done (per phase)

1. Only mechanical moves (or the explicitly-noted small `lib/` relocations).
2. Public import paths unchanged; no call sites edited unless the phase says so.
3. New modules have colocated tests where they carry logic; parity tests where
   output could shift (P golden test, A4 render, D1 undo/batch).
4. `npm run typecheck && npm run lint && npm test` all green — reported honestly.
5. One file/store per commit; each independently revertable.

## Suggested landing order

`P` → `A1` → `A3` → `A2` → `A8` → `A7` → `A6` → `A5` → `A4` → `D2` → `D1`

(Mechanical + well-tested first; hot-path and high-blast-radius last.)
