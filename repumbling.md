# P4 — Option B (full sweep): deferred plan

> Working/scratch document — keep untracked, do not commit.
> Captured while executing **Option A** (broadcast-cluster only) so the wider
> sweep isn't lost. This is the "clean every screen" path we chose NOT to take
> now, and *why*, plus exactly what it would entail if revisited.

## Context — what P4 is

Some screens keep a private copy (local `useState`) of information and re-sync it
to a source of truth inside a `useEffect`. When that mirror can drift, the screen
shows stale data. The lint rule `react-hooks/set-state-in-effect` flags every
`setState` inside an effect; the codebase silences it with
`// eslint-disable-next-line react-hooks/set-state-in-effect` at each accepted
site. P4 = audit those silences and remove the ones that are genuine
store-mirrors, replacing them with narrow selectors / values derived during
render.

## The finding that shaped the decision

**The classic removable antipattern is already gone.** The mirror P4 originally
named — `broadcast-settings` keeping local `mainThemeId` / `mainEnabled` copies
with reconcile effects — was deleted by **D3** (theme now derived from the store
output) and **S2** (output-window effects moved into hooks that read the store /
refs directly). `broadcast-output.tsx` now has **zero** such disables.

So **Option A is effectively already satisfied** — no safe mirror-removal remains
in the broadcast cluster. Option B is therefore NOT "remove store mirrors" (there
are none left); it is an **audit + modernization of reset-on-change effects**
across the whole app. That is lower value and higher risk than the original P4
framing implied.

## Full inventory — 14 disables across 9 files (measured)

| # | File:line | What it does | Category | Removable? |
|---|-----------|--------------|----------|------------|
| 1 | `verse-edit/verse-edit-modal.tsx:114` | `setTextChanged` on editor/verse change | reset-derived-on-change | Maybe — derive during render |
| 2 | `verse-edit/verse-edit-modal.tsx:136` | `updatePreview()` seed then subscribe | imperative seed + subscribe | No — editor subscription |
| 3 | `panels/preview-panel.tsx:188` | reset interlinear view on verse change | reset-derived-on-change | Maybe — `key`-remount |
| 4 | `panels/preview-panel.tsx:198` | drop interlinear when lexicon disabled | reset-on-external-toggle | Maybe — derive/guard in render |
| 5 | `panels/LexiconBar.tsx:38` | reset to loading state before fetch | reset-before-async | No — async I/O pattern |
| 6 | `broadcast/design-canvas.tsx:310` | kick off timed transition-preview anim | animation trigger | No — imperative timeline |
| 7 | `broadcast/output-manager.tsx:100` | `fetchMonitors()` on dialog open | async-load-on-open | No — async action |
| 8 | `broadcast/theme-designer.tsx:148` | reset name-editing on editingThemeId change | reset-derived-on-change | Maybe — `key`-remount |
| 9 | `broadcast/stage-layout/stage-layout-designer.tsx:89` | reset name-editing on editingId change | reset-derived-on-change | Maybe — `key`-remount |
| 10 | `broadcast/broadcast-settings.tsx:286` | `fetchMonitors()` on dialog open | async-load-on-open | No — async action |
| 11 | `hooks/use-output-controller.ts:283` | steer monitor off operator screen, preserve manual pick | intent-preserving reconcile | No — stateful, would clobber user choice |

(11 sites listed; the count of 14 comes from three sites that wrap 2–3 `setState`
calls in one `disable/enable` block — preview-panel ×2 blocks, LexiconBar ×1
block cover multiple setters each.)

**None are store-mirrors.** The removable-in-principle ones (rows 1, 3, 4, 8, 9)
are *reset-derived-UI-on-input-change* — a legitimate React pattern the lint rule
flags conservatively. They are the only candidates, and each is cosmetic.

## If Option B is revisited — recommended treatment per category

1. **async-load-on-open** (7, 10) and **reset-before-async** (5) — **keep the
   disable**, they are correct. Only action: make sure each carries a one-line
   justification comment (most already do). No behavior change.
2. **animation trigger** (6) and **imperative seed+subscribe** (2) — **keep**.
   These drive imperative timelines / editor subscriptions; the effect is the
   right tool. No change.
3. **intent-preserving reconcile** (11) — **keep**. Deriving `selectedMonitor`
   purely from `monitors` would erase the operator's manual monitor pick every
   time displays change. The effect preserves user intent by construction.
4. **reset-derived-on-change** (1, 3, 4, 8, 9) — the *only* real candidates:
   - For the name-editing resets (8, 9) and interlinear resets (3): prefer a
     **`key`-based remount** — give the sub-tree a `key={editingId}` /
     `key={selectedVerse?.id}` so React resets the local state automatically, no
     effect, no disable.
   - For toggle-driven drops (4) and `textChanged` (1): prefer **deriving the
     value during render** from the current inputs where the value has no
     independent user-editable life.
   - Each is a **per-file, isolated change with its own manual smoke test** (open
     the editor / lexicon / designer, change the keyed input, confirm the reset
     still fires and nothing flickers). Do them one at a time, never as a batch.

## Why we deferred it (the standing recommendation)

- **No correctness win.** There is no live store-mirror drift bug left to fix; D3
  and S2 already closed that. B is tidiness (fewer lint disables), not a fix.
- **Live-critical surface.** These screens run during a service (preview panel,
  designers, verse-edit, output/monitor dialogs). A `key`-remount or
  derive-in-render change can subtly alter when local state resets — exactly the
  kind of regression you don't want surfacing on a Sunday for zero user benefit.
- **Right time to do a row:** when you're already in that file for a feature or a
  real bug, convert its reset-on-change effect then, with the smoke test you're
  already running. Opportunistic, not a dedicated sweep.

## Verification gate (whenever any row is done)

`npm run typecheck && npm run lint && npm test` clean, plus the per-file manual
smoke for the specific screen touched. Removing a disable must not change when the
reset fires — prove it by exercising the keyed input.
