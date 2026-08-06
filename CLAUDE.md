# CLAUDE.md

Guidance for working in this repository. These are **rules and gates**, not
suggestions — new code is expected to follow them, and changes that violate them
should be reworked before landing. When an existing file predates a rule, bring
it into line opportunistically while you're in it; don't rewrite the world.

## What this is

LumenLive is a **Tauri v2 desktop app** — React + TypeScript frontend, Rust
backend (`src-tauri/`) — for running live church services: scripture, slides,
media, broadcast/NDI output, and real-time AI verse detection. The frontend is
Vite + React 19, state is Zustand, styling is Tailwind v4 + shadcn/Radix.

## Commands (the verification gates)

Run these from the repo root. **All three must pass before any change is
considered done:**

```bash
npm run typecheck   # tsc --noEmit — zero errors
npm run lint        # eslint . — zero errors/warnings
npm test            # vitest — full suite green
```

Also useful: `npm run format` (Prettier), `npm run dev` (Vite), `npm run tauri`
(desktop shell). Rust/data pipeline commands (`build:bible`, `precompute:*`,
etc.) are in `package.json` — don't run them casually; several download models or
rebuild databases.

Do not mark work complete, open a PR, or claim success without a clean
typecheck + lint + test run and reporting the actual result.

## Architecture — the layering that the decouple refactor established

Business logic was deliberately extracted out of components and stores into
dedicated layers. **Preserve that separation.** The dependency direction is
one-way:

```
components/  (React: rendering, local UI state, wiring)
    │  may import ↓
stores/      (Zustand: app state + orchestration)
    │  may import ↓
lib/  +  services/   (the logic + I/O boundary)
    │  may import ↓
types/       (shared type definitions, pure)
```

### `src/lib/**` — pure business logic

- **No React, no Zustand, no `@tauri-apps` imports.** These modules are pure
  functions over plain data (verified: the presentation/verse-renderer/
  slide-renderer/broadcast/search/settings modules import none of them).
- Folder-per-domain with a barrel `index.ts` where it helps (e.g.
  `lib/verse-renderer/`, `lib/slide-renderer/`, `lib/presentation/`).
- This is where mutations, layout math, parsing, rendering, and history logic
  live. If a store method is growing real logic, extract it here.
- **Every non-trivial lib module gets colocated `*.test.ts`** (see Testing).

### `src/services/**` — the Tauri/IPC boundary ("gateways")

- **All `invoke(...)` / `listen(...)` calls belong in a gateway.** A gateway
  owns the command names and event strings for one subsystem so the rest of the
  app never hardcodes them. See `services/remote-control-gateway.ts` for the
  canonical shape: typed functions, documented, disposers that clean up every
  listener even on mid-loop failure.
- Async listener subscriptions return a **disposer**; callers must call it on
  unmount. Never orphan a listener.
- New feature that talks to Rust → add/extend a gateway, don't reach for
  `invoke` inline. (Some older components still call `invoke` directly; that's
  legacy to migrate, not a pattern to copy.)

### `src/stores/**` — Zustand

- Stores orchestrate; they delegate real logic to `lib/` (import as namespaces:
  `import * as history from "@/lib/presentation/history"`).
- Keep store state serializable plain data.

### `src/components/**`

- Rendering, local UI state, and wiring stores/services together. Grouped by
  domain (`broadcast/`, `schedule/`, `slides/`, `panels/`, `media/`, `ui/`…).
- `components/ui/` is the shadcn/Radix primitive layer — treat as a design
  system, extend rather than fork.

## State management rules (Zustand)

- **Subscribe narrowly.** Select the smallest slice a component needs, not whole
  objects/arrays that mutate frequently. A component that reads one field from a
  per-tick-updating store (audio level, media transport) must select just that
  field — extract a leaf component if needed (see `AudioLevelMeter` in
  `transport-bar.tsx`).
- **Undo/redo uses `structuredClone`**, never `JSON.parse(JSON.stringify(...))`.
- **Continuous gestures record one undo snapshot, not one per event.** Sliders,
  color pickers, and drags must debounce snapshots — follow the
  `UNDO_DEBOUNCE_MS` (300ms) + `lastUndoPush` pattern in `presentation-store.ts`
  / `broadcast-store.ts`. Undo stacks are capped (`UNDO_LIMIT = 50`).
- Read-during-event without subscribing: use `useStore.getState()` inside
  handlers/effects so the listener isn't re-bound every render (and drop it from
  effect deps).

## Performance rules (from the perf sweep)

The app has three hot paths. Respect them:

1. **Per-frame canvas render.** The RAF draw loop must not re-wrap/re-measure
   text every frame. Verse/slide layout + `measureText` results are cached and
   invalidated on content/theme change, **not** per frame. Don't reintroduce
   per-frame `measureText`, per-token `ctx.save()/restore()`, or fresh
   canvas/pattern allocation inside a draw loop — reuse persistent offscreen
   canvases (see `design-canvas.tsx`).
2. **Editor mutations.** Drag/slider gestures must not deep-clone the whole
   presentation per pointer event. Batch multi-select edits into a **single**
   presentation rebuild (`updateDraftElementsBatch` / `updateElementsById`) and
   rAF-coalesce drag commits (one write per frame, flush final on `pointerup`).
3. **High-frequency re-renders.** `React.memo` leaf components whose props are
   stable; keep memos holding by `useMemo`-ing derived props and making handlers
   stable (read via `getState()` instead of closing over state). Note: `memo`
   can't hold if a prop is a fresh factory each render (e.g. `useDragSource()`) —
   lift state to a leaf instead.

React Compiler is **not** enabled and `useShallow` is not used — so manual
memoization and narrow selectors are load-bearing, not optional. Prefer O(1)
`Map` lookups over O(n) `find` inside `.map()` render loops. Cap unbounded
buffers (transcripts/segments cap at 500 via `.slice(-N)`).

When you touch a hot path, don't regress it; when a perf change could alter
output, **layout/render output must stay byte-identical** — prove it with a
test.

## Testing rules

- **Colocated `*.test.ts`** next to the module (`foo.ts` → `foo.test.ts`),
  Vitest.
- **New/changed lib logic requires tests.** Pure `lib/` modules and gateways are
  the primary tested surface; the refactor added ~27 test files here.
- Refactors that must not change behavior (perf work, extractions) get a
  **parity test** proving the new path equals the old output across a grid of
  inputs — this is the standard set by the perf sweep (e.g. binary-search shrink
  == linear scan; reused wrapping == recomputed wrapping).
- Pure-logic changes in `lib/` are where tests go; pure UI re-render/subscription
  changes with no behavioral surface may rely on the existing suite — say so
  explicitly.

## Code style

- **Prettier is authoritative** (`.prettierrc`): no semicolons, **double
  quotes**, 2-space indent, trailing commas es5, 80-col, LF. Run `npm run format`
  rather than hand-formatting.
- **Path alias `@/` → `src/`.** Use it for cross-directory imports.
- Import shared logic as namespaces where a module is a cohesive toolkit
  (`import * as slides from "@/lib/presentation/slide-mutations"`).
- Prefix intentionally-unused vars/args with `_` (eslint is configured for it).
- **Document the non-obvious.** Modules and tricky functions carry doc comments
  explaining *why* (see `history.ts`, `remote-control-gateway.ts`) — match that
  density. Comments explain intent and edge cases, not the obvious.
- Keep types in `src/types/**`; they're pure and shared.

## Before you finish — the gate

1. Logic lives in `lib/`/`services/`, not stuffed into a component or store.
2. No `invoke`/`listen` outside a `services/` gateway (in new code).
3. No React/Zustand/Tauri imports leaked into `src/lib/**`.
4. Narrow store selectors; no per-event whole-doc clones; debounced undo.
5. Hot paths not regressed; output-preserving changes proven byte-identical.
6. Tests added/updated and colocated.
7. `npm run typecheck && npm run lint && npm test` all clean — reported honestly.
