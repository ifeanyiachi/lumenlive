# Schedule voice navigation ("next slide" / "previous slide")

Voice command layer that lets a pastor drive the **schedule list** by speaking —
"next slide", "turn to the next slide", "go back to the previous slide". Here a
"slide" means an item on the schedule list (and its sub-slides within a deck),
**not** a verse. This is kept fully separate from the existing verse-command
voice navigation.

## Anchoring rule (load-bearing)

Next/previous is **always** resolved against the **currently active schedule
item** (`activeItemIndex` / `activeSlideIndex`), never against the last spoken
reference or any other cursor. This mirrors the verse-command contract, where the
step anchors on the live selection regardless of how it got there. The Rust side
carries **intent only** (direction + count); the frontend/store resolves the
actual target against the active item. So the command works no matter how the
current item became active — arrow keys, a click, a previous voice command, or a
Go Live.

## Design decisions (confirmed)

- **Granularity: step through sub-slides too.** Maps to the schedule store's
  `nextItem()` / `prevItem()`, which step lyric-by-lyric inside a
  song/presentation/scripture-collection deck and then roll over to the next
  schedule item — i.e. "advance what is on screen", anchored on the active item.
- **New toggle "Schedule voice navigation goes live" defaults ON.** When on, a
  spoken "next slide" steps the active item *and* pushes it to the audience
  immediately. When off, it only stages into Program preview for the operator to
  take. Independent of the verse setting (`navAutoLive`).
- **Keyword-disjoint from verse commands.** Verse commands require the word
  "verse"; slide commands require "slide"/"slides". They never collide, so both
  can run on the same final transcript.

### Behavior caveat

With sub-slide stepping + goes-live ON, each "next slide" during a live item
takes the new slide to the audience instantly. A pastor's offhand mid-sentence
"let's go to the next slide" therefore moves the audience screen. The
`MAX_NAV_WORDS` dominance guard + the "slide" keyword requirement limit firing to
short, command-like utterances.

## Existing pipeline being mirrored

- **Rust detector** (`src-tauri/crates/detection/src/direct/detector.rs`):
  `detect_verse_command` classifies short utterances into intent (`VerseCommand`).
- **Tauri boundary** (`src-tauri/src/commands/stt/detection.rs` + `events.rs`):
  `check_verse_command` emits the `verse_command` event, finals-only (commands
  aren't idempotent, so running on volatile partials would double-fire).
- **Settings** (`settings-store.ts` + `display-mode-section.tsx`): `navAutoLive`
  ("Voice navigation goes live") toggle.
- **Frontend** (`transcript-panel.tsx`): listens for `verse_command`, resolves
  against live selection, stages or goes live per `navAutoLive`.
- **Schedule store** (`src/stores/schedule/navigation.ts`): `nextItem()` /
  `prevItem()` already do sub-slide + item stepping anchored on `activeItemIndex`;
  `presentLive` is the established "stage then takeToLive" pattern.

---

## Phased implementation

### Phase 1 — Rust detector (`detection` crate)

`src-tauri/crates/detection/src/direct/detector.rs`
- Add `SlideCommand { direction: NavDirection, count: u32 }`.
- Add `DirectDetector::detect_slide_command(&self, text) -> Option<SlideCommand>`,
  structured like `detect_verse_command` but:
  - gated on whole-word `"slide"` / `"slides"` (via `contains_word`), not "verse".
  - forward phrases: "next slide", "next one" (only with "slide"), "go to the next
    slide", "turn to the next slide", "move to the next slide", "on to the next
    slide", "forward one slide".
  - backward phrases: "previous slide", "last slide", "slide before", "go back a
    slide", "back one slide", "back a slide", "go back to the previous slide".
  - reuse guards: `MAX_NAV_WORDS` dominance guard; bail if `find_books` is
    non-empty (a real reference); refuse when both directions are named.
  - optional count via `parser::first_number`, clamped `1..=MAX_RELATIVE_STEP`,
    default 1.
- Export `SlideCommand` from `src-tauri/crates/detection/src/lib.rs`.
- Colocated unit tests: positive phrasings (each direction), count parsing,
  prose rejection ("...and the next slide of his argument..."), both-directions
  rejection, book-reference bailout, "next verse" must NOT match.

**Gate:** `cargo test -p lumenlive-detection`.

### Phase 2 — Tauri boundary

`src-tauri/src/commands/stt/detection.rs`
- Add `check_slide_command(app, transcript)`: locks the `DirectDetector`, calls
  `detect_slide_command`, emits `slide_command` with payload
  `{ direction: "next" | "previous", count }` (tagged the same way as
  `verse_command`'s relative arm). Log the intent.

`src-tauri/src/commands/stt/events.rs`
- Call `check_slide_command(&event_app, &transcript)` in the **finals** branch,
  right after `check_verse_command`. Import it alongside the others.

**Gate:** `cargo build` (backend compiles).

### Phase 3 — Settings

`src/stores/settings-store.ts`
- Add `scheduleNavAutoLive: boolean` (default `true`), `setScheduleNavAutoLive`,
  and add `"scheduleNavAutoLive"` to `PERSISTED_KEYS`.

`src/components/settings/sections/display-mode-section.tsx`
- Add a `ToggleCard` "Schedule voice navigation goes live" in the Detection
  Behavior group, describing the "next slide" / "previous slide" phrasing and the
  stage-vs-live behavior.

### Phase 4 — Schedule store orchestration

`src/stores/schedule/navigation.ts`
- Add `stepSlideByVoice(direction: "next" | "previous", count: number, goLive:
  boolean)` to the navigation slice:
  - anchored on the active item; loop `nextItem()` / `prevItem()` `count` times
    (each already anchors on `activeItemIndex` / `activeSlideIndex`).
  - when `goLive`, call `useBroadcastStore.getState().takeToLive()` once after
    stepping (mirrors `presentLive`).
- Add the method to the `NavigationSlice` `Pick<...>` and `ScheduleState`.
- Test in `src/stores/schedule-store.test.ts`: stepping advances the active item /
  sub-slide; `count > 1` steps that many; `goLive` triggers a take; direction is
  honored.

### Phase 5 — Frontend wiring

`src/components/panels/transcript-panel.tsx`
- Add a `SlideCommandPayload` type `{ direction: "next" | "previous"; count:
  number }`.
- Add `useTauriEvent<SlideCommandPayload>("slide_command", (p) => { ... })` that
  reads `scheduleNavAutoLive` from settings and calls
  `useScheduleStore.getState().stepSlideByVoice(p.direction, p.count,
  scheduleNavAutoLive)`. Thin wiring only — orchestration lives in the store.

---

## Verification gate (all must pass, reported honestly)

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `cargo test -p lumenlive-detection`
