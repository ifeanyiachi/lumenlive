# Soniox live-service detection — false-display diagnosis & proposed fixes

Scratch/planning file — untracked, do not commit (per repo convention: markdown
here is planning, keep it out of git).

Context: Soniox transcription itself is healthy (clean finals, digit-form
numbers, high confidence, no text duplication). The problems the operator saw
in live services are in the **detection / routing / reading-mode** layer that
sits *downstream* of transcription — they are not Soniox bugs. Evidence pulled
from `…/logs/LumenLive.log` and `…/logs/transcripts/transcript-2026091*.log`.

---

## Symptoms reported

1. An Isaiah verse (esp. `Isaiah 9:11`) shows up almost every time.
2. Direct verses auto-preview even when wrong.
3. While reading `Ecclesiastes 9:11` it switched to `:12`, then to
   `1 Corinthians 1:13` — none of which were called.
4. Pastor said `Acts 2:1`; it changed to `Acts 1:6`.
5. A manually-set direct verse: preview "heard 'continue'" and changed to
   `Acts 1:7`.
6. Called `John 15:4`, recorded it, presented it live from the panel — within
   ~1 s the screen changed to `Acts 1:8`.

---

## Root causes (three distinct bugs)

### Bug 1 — Reading Mode auto-advance walks the chapter during preaching, and overrides the operator  *(highest impact)*

Once a chapter is loaded, `ReadingMode::check_transcript`
(`crates/detection/src/reading_mode.rs:347`) advances verse-by-verse whenever
the **accumulated sermon text overlaps ≥ 40 %** of the next verse's words
(`MIN_WORD_OVERLAP = 0.40`, line 13). During expository preaching — where the
pastor paraphrases/quotes the passage — that bar is crossed constantly, so it
"walks" the chapter on its own.

Log proof (22:24 session, `lumenlive_detection::reading_mode`):

```
22:33:59  Started:     Acts 1:3
22:34:05  Advanced to: Acts 1:4
22:36:41  Advanced to: Acts 1:5
22:37:39  Advanced to: Acts 1:6    ← no "verse N" command logged → pure word-overlap
22:38:32  Advanced to: Acts 1:7
22:39:28  Advanced to: Acts 1:8
```

Maps to the reports:
- #4 `Acts 2:1 → Acts 1:6` — RM stuck on Acts 1; a bare "Acts 2:1" doesn't hit
  the chapter-change cue, so the overlap advance to 1:6 wins.
- #5 "continue → Acts 1:7" — the 22:38:32 overlap advance; "continue" didn't
  trigger it, ongoing prose did.
- #6 present `John 15:4` → screen jumps to `Acts 1:8` — the 22:39:28 advance.

**Override mechanism:** the `reading_mode_verse` handler
(`src/components/panels/transcript-panel.tsx:309`) calls `selectVerse` +
`setPendingNavigation` and **never consults `aiMayTakeLive` / the manual-live
guard** (`src/lib/detection/manual-live-guard.ts`). So a Reading-Mode advance
clobbers operator-placed live content — exactly what that guard exists to stop.

Aggravating factors:
- `READING_MODE_TIMEOUT_MS = 180_000` — armed for 3 min after the last match.
- `check_transcript` also probes current+1 **and** current+2
  (`reading_mode.rs:413–431`), so it can skip ahead.
- Advance is driven by `accumulated_text` (running sermon prose), not by the
  contiguous words of the verse actually being read.

### Bug 2 — Direct parser attaches phantom books to a bare `chapter:verse` ("Isaiah keeps showing")

In the 15:32 session the word "Isaiah" was **never spoken** (0 hits in
PARTIAL/FINAL text) yet `Isaiah 9:11` fired **80×**. Source text was
*"In verse 12 of Ecclesiastes 11:3 … Ecclesiastes 9:11"*. A bare `9:11` gets
attached to Isaiah as well as Ecclesiastes; Isaiah survives every time because
it has 66 chapters, so almost any `N:M` is a valid Isaiah verse. Same pattern
for `1:13` / `1:14` co-firing across Song of Solomon, Revelation, and Acts at
once. All are `[narrative]`-tagged. Locus: `crates/detection/src/direct/parser.rs`.

Routing note: narrative-tagged hits are correctly **blocked from auto-preview**
(`shouldAutoStagePreview` requires `narrative_mention !== true`,
`detection-routing.ts:77`) — but they are `auto_q=true`, so they **flood the
panel and queue**. That's the "shows up every time" noise (#1).

### Bug 3 — Genuine-but-unwanted teaching citations auto-preview

`Acts 1:3 (100%)` (not narrative-tagged) auto-staged from
*"In Acts chapter 1, from verse 3 to 4…"* — the pastor was teaching, not asking
to display. `shouldAutoStagePreview` fires on real exposition citations. This is
the #2 / #3 class ("auto-preview even when wrong").

Minor: DETECT log lines are duplicated 2–4× per verse (per-candidate logging) —
cosmetic noise, worth a look while in the area.

---

## Option A — Disable Reading Mode entirely

What "Reading Mode" uniquely provides today:
1. **Hands-free auto-advance** while a passage is read aloud (word-overlap) — no
   command needed. *(This is both its unique value and Bug 1.)*
2. Auto-load a chapter's verses when a direct reference is detected.
3. Chapter-jump voice command ("go to chapter 7") — `handle_chapter_nav`.

What is **NOT** lost (independent of Reading Mode — verified):
- **Voice verse commands** — "next verse", "previous verse", "verse 5" — run on
  a separate path (`check_verse_command`, `commands/stt/detection.rs:961`) that
  anchors on the currently-selected program verse. These keep working.
- **Voice slide commands** ("next slide") — `check_slide_command`, independent.
- **Direct detection** (panel/queue/preview of explicitly-spoken references) —
  independent; unaffected.
- **Semantic detection** — independent; unaffected.

How it would be disabled: gate the `check_reading_mode(...)` call in
`commands/stt/events.rs:90` behind a setting (preferred) or remove it. The
`reading_mode` entitlement already exists (`lib/entitlements/index.ts:49`), so a
Settings toggle "Auto-follow while reading (beta)", default **off**, is the
clean shape.

### Pros
- **Kills Bug 1 outright** — the single biggest cause of phantom screen changes
  and of overriding operator-placed live. No more mid-sermon verse walking.
- **Low blast radius** — the operator keeps every deliberate control: direct
  detection, the panel/queue, and *spoken* "next verse / verse 5 / next slide"
  navigation all survive. The operator advances verses by voice or by click, on
  purpose, instead of the app guessing.
- **Simpler, more predictable behavior** — the app only changes the screen when
  told to (a spoken command or an operator click), which matches how most live
  operators expect it to work.
- **Removes a whole class of edge cases** — chapter-boundary confusion, the
  current+2 skip-ahead, the 3-minute armed window, and the guard-bypass all go
  away with one gate.
- **Reversible / shippable now** — a default-off toggle is safe to ship
  immediately and re-enable per-church once fixed.

### Cons
- **Loses the marquee hands-free feature** — a pastor who slowly reads a whole
  chapter no longer has verses auto-follow; the operator (or a spoken "next
  verse") must advance. For churches that relied on auto-follow this is a
  regression in convenience.
- **Loses "go to chapter 7" chapter jumps** unless that one piece is re-homed
  onto the independent command path (verse commands cover verses, not chapters).
- **Loses auto-loading the chapter context** — some downstream niceties that
  assume a loaded chapter (e.g. instant "next verse" against the just-read
  chapter) may need the current program selection instead; verify no dead paths.
- **Doesn't fix Bugs 2 & 3** — phantom "Isaiah" books and unwanted auto-preview
  of teaching citations are in the *direct parser / auto-preview routing*, not
  Reading Mode. Disabling RM leaves the panel/queue noise and the auto-preview
  hijack of explicitly-parsed refs. (These need their own fixes below.)
- **Feels like a step back** for a feature that was built deliberately (aitrans
  phases) rather than a targeted repair.

### Verdict on Option A
A good **immediate mitigation** (default-off toggle) because it stops the worst,
most alarming behavior with minimal risk — but it is **not sufficient alone**:
Bugs 2 and 3 still need fixing, and long-term the auto-follow feature is worth
repairing rather than deleting.

---

## Option B — Targeted fixes (keep Reading Mode, make it safe)

Ordered by impact. Can be shipped incrementally; B1 + B2 alone resolve the
screen-change reports.

**B1 — Reading Mode must respect the operator (fixes the override).**
Route `reading_mode_verse` through the manual-live guard: an auto-advance is
*low-trust*, so it may stage Program Preview but must **never auto-take** live
when the current live source is operator-owned (`schedule`/`queue`/`manual`).
Wire `aiMayTakeLive(liveSource, /*isLowTrust*/ true)` into the
`reading_mode_verse` handler (`transcript-panel.tsx:309`). Distinguish true
spoken commands ("next verse", chapter nav) as high-trust from word-overlap
auto-advance as low-trust.

**B2 — Stop the phantom walk (fixes the auto-advance during preaching).**
In `reading_mode.rs`:
- Raise `MIN_WORD_OVERLAP` from `0.40` to ~`0.6–0.7`.
- Require overlap on the **current** verse before probing the next (don't jump on
  next/next+2 alone), or require *contiguous* verse-word runs rather than a bag
  of accumulated sermon words.
- **Require two consecutive high-confidence matches to the next verse's text
  before advancing** (instead of a single overlap crossing) — one paraphrase
  brushing the threshold must not move the screen; a real read-through will match
  twice in a row. Pair this with the explicit-command path so an advance fires on
  *either* a spoken command ("next verse", "continue reading", "verse 8") *or*
  two consecutive text matches, never on a lone overlap tick.
- Reduce/scope `READING_MODE_TIMEOUT_MS` (3 min is long) and reset
  `accumulated_text` more aggressively.
- Consider gating auto-advance to only fire when overlap is high AND the
  transcript looks like *reading* (long verbatim run) vs *teaching* (paraphrase).

**B3 — Kill phantom books (fixes "Isaiah every time").**
In `direct/parser.rs`, do not expand a bare `chapter:verse` onto books that were
not spoken or cued in the surrounding text. Drop the many-books-per-number
fan-out so a single spoken "Ecclesiastes 9:11" yields Ecclesiastes only — not
Isaiah/Song of Solomon/Revelation. (Needs a close read of the parser's
book-attachment rule to pin the exact change + a parity test.)

**B4 — Tighten auto-preview (fixes teaching-citation hijack).**
Require an explicit *display* cue ("turn to", "let's read", "go to") for a direct
reference to auto-stage Program Preview. Exposition citations still populate the
panel/queue for a deliberate operator send, but stop hijacking preview.

**B5 — De-duplicate identical direct detections (fixes panel/queue flooding).**
Distinct from log hygiene (B6): dedupe at the *detection* level, not just in the
output. A single utterance that resolves to the same `verse_ref` (e.g.
`Isaiah 9:11` firing 80× across successive partials of one sentence) must collapse
to **one** panel/queue entry. Key by `verse_ref` within an utterance/sentence
window and keep the highest-confidence instance — the same shape
`autoPreviewCandidate` already uses for preview
(`detection-routing.ts:90`), applied to panel/queue admission too. This is the
detection-side complement to running detection on aggregated Soniox finals rather
than every interim frame (see the rhema `sentence_buffer` note below).

**B6 — Log hygiene (minor).**
De-duplicate the per-candidate DETECT lines so the transcript logs are readable.

---

## Recommendation

1. **Ship Option A as a default-off "Auto-follow while reading (beta)" toggle
   now** — immediate relief; the app stops changing the screen on its own during
   services.
2. **In parallel, do B3 + B4 + B5** — these fix the panel noise (phantom books,
   duplicate detections) and the auto-preview hijack regardless of Reading Mode,
   and they benefit every service.
3. **Then B1 + B2** to make Reading Mode safe, and flip the toggle back on once
   validated on a recording (the two 30-min playbacks already in
   `sonioxtest.md`).

This keeps the operator in control immediately, fixes the parser/routing bugs
that Option A can't reach, and preserves the hands-free feature for when it's
trustworthy — rather than permanently deleting it.

---

## Comparison with `rhema-main` (sibling repo)

Question asked: has rhema-main already implemented/solved what we're facing?
**Short answer: no.** rhema-main is the older/upstream lineage (v0.3.1, Deepgram;
LumenLive is the newer Soniox fork). It has the **identical** Reading Mode bug
and is actually *behind* LumenLive on routing safety — but it kept two upstream
modules LumenLive dropped or weakened that would help Bugs 2 & 3.

### Bug 1 (Reading Mode) — identical and unsolved in rhema
Same code, byte-for-byte in intent:
- `MIN_WORD_OVERLAP = 0.40`, `READING_MODE_TIMEOUT_MS = 180_000`
  (`rhema .../reading_mode.rs:10,13`).
- Same `check_transcript` overlap advance with current+1 **and** current+2
  skip-ahead (`:395,404,420,430`), same `accumulated_text` growth.
- Same unguarded `reading_mode_verse` handler — `selectVerse` +
  `setPendingNavigation`, **no** `aiMayTakeLive` (`rhema transcript-panel.tsx:194`).

→ Nothing to port; the bug originated upstream. B1/B2 fixes are still ours to make.

### Routing safety — LumenLive is AHEAD of rhema
rhema has **no `src/lib/detection/` at all** — no `manual-live-guard.ts`, no
`shouldAutoStagePreview`, no `passesPanelFloor`, no `narrative_mention` gating.
The auto-preview/panel-floor/narrative protections are LumenLive-only additions
(from the aitrans work). So rhema would be *worse* on the override, not better.

### Bug 2 (phantom / impossible refs) — rhema is AHEAD; LumenLive REGRESSED  ⬅ portable win
- **rhema:** `direct/versification.rs` ships a per-chapter verse-count table
  (`MAX_VERSES[book][chapter]`) and `is_valid_verse(book, chapter, verse)`
  (`:103`), applied inside the parser (`rhema parser.rs:480`). It rejects
  impossible references (e.g. "Revelation 20:22" — Rev 20 ends at 15).
- **LumenLive:** has **no** `versification.rs`. Its parser validates only against
  a flat `const MAX_VERSE = 176` (`parser.rs:743`) — i.e. it accepts *any* verse
  ≤ 176 for *any* book+chapter. Per-book validation was lost.
- **Action:** port rhema's `versification.rs` (+ `is_valid_verse`) into
  LumenLive's parser. Caveat: it won't stop `Isaiah 9:11` specifically (that
  verse exists), but it kills the impossible-verse and many misheard-number
  phantoms and tightens every parse. Regenerate the table from the active Bible
  DB. This is a clean, low-risk lift with an obvious parity test.

### Bug 2/3 noise (per-partial detection spam) — rhema has a tool LumenLive lacks
- **rhema:** `sentence_buffer.rs` accumulates fragments into complete sentences
  (flush on `.!?`, timeout, or `speech_final`) *before* running detection —
  "running detection on each fragment produces worse results than on complete
  sentences."
- **LumenLive:** runs **direct detection on every partial** (`events.rs:51`,
  "partials run direct detection only"). That is exactly why the logs show
  `Isaiah 9:11` firing 80× as `direct-partial` for one utterance.
- **Action (consider):** buffer to sentence boundaries before detection to cut
  the per-partial spam feeding the panel. Caveat: LumenLive is Soniox now and the
  `SonioxAggregator` already emits cumulative partials + a clean `Final`, so a
  straight port doesn't fit — the equivalent is to run panel/direct detection on
  the aggregated `Final` (and dedupe partials) rather than every interim frame.

### `fusion.rs` (rhema) — tangential
Reciprocal-rank-fusion for hybrid semantic+FTS5 search. Relevant to semantic
*search quality*, not to the display bugs. Note only; not part of this fix.

### Net
- Reading Mode bug: **not solved in rhema** — fix it ourselves (Option A toggle
  and/or B1+B2).
- Verse-existence validation: **rhema did it better** — port `versification.rs`
  (fixes a real LumenLive regression, helps Bug 2). ⬅ highest-value port
- Detect-on-sentence: **rhema's idea is sound** — adapt to Soniox finals to cut
  Bug 2/3 noise.
- Override guard + narrative routing: **LumenLive already ahead** — just finish
  wiring the guard into the reading-mode path (B1).

---

## File / line index (for whoever implements)

- `crates/detection/src/reading_mode.rs:13` — `MIN_WORD_OVERLAP = 0.40`
- `crates/detection/src/reading_mode.rs:10` — `READING_MODE_TIMEOUT_MS = 180_000`
- `crates/detection/src/reading_mode.rs:347` — `check_transcript` (overlap advance)
- `crates/detection/src/reading_mode.rs:413–431` — current+1 / current+2 probes
- `crates/detection/src/direct/parser.rs` — book attachment / phantom expansion
- `src/commands/stt/events.rs:90` — `check_reading_mode(...)` call site (gate here)
- `src/commands/stt/detection.rs:694` — `maybe_start_reading_mode`
- `src/commands/stt/detection.rs:807` — `handle_chapter_nav`
- `src/commands/stt/detection.rs:893` — `handle_advance` (emits `reading_mode_verse`)
- `src/commands/stt/detection.rs:961` — `check_verse_command` (INDEPENDENT of RM)
- `src/components/panels/transcript-panel.tsx:309` — `reading_mode_verse` handler
  (no manual-live guard — the override bug)
- `src/lib/detection/manual-live-guard.ts` — `aiMayTakeLive`
- `src/lib/detection/detection-routing.ts:70` — `shouldAutoStagePreview`
- `src/lib/entitlements/index.ts:49` — `reading_mode` entitlement
