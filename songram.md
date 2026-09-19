# songram — Retire Deepgram + BYOK, Soniox becomes the only STT backend

Phased implementation plan. Goal: make **Soniox the single, only** speech-to-text
provider and **remove the BYOK (bring-your-own-key) path entirely**. Deepgram is
deleted, not demoted.

## Context / decisions locked in

- **LumenBO is already minting/returning Soniox keys** (`provider: "soniox"`) for
  these clients, so flipping the desktop off Deepgram carries no
  "Soniox-client-with-a-Deepgram-key → auth failure" risk.
- Provider selection is **server-authoritative**. After this change the desktop no
  longer branches on provider at all — it always builds a Soniox client. If
  LumenBO ever returns a non-Soniox key again, the desktop simply fails auth
  (acceptable — Deepgram is gone).
- **BYOK is dead.** No more "bring your own Deepgram key" mode, no
  `key-invalid` reporting, no BYO status fields. Transcription is
  platform-managed keys only (paid / trial / blocked).
- Soniox backend already exists and works (`crates/stt/src/soniox.rs`,
  `SonioxClient`, `SonioxConfig`, `SONIOX_API_KEY` fallback, frontend already
  relays `resolution.provider`). This is a **removal/collapse**, not a build.
- `.md` files (incl. this one, `README.md`, `.github/SECURITY.md`) are **not
  committed** per repo convention — code + `.env.template` are the committed
  surface.

## Verified facts that shape the work

- `rest.rs` / `DeepgramRestClient` is **dead code** — never constructed anywhere,
  sits behind the default `rest-fallback` Cargo feature. Safe to delete outright.
- `SttConfig` (Deepgram-shaped) is used only by `deepgram.rs`, `rest.rs`, and
  `model.rs::build_deepgram` → removable once those go.
- `start_transcription` (registered `src-tauri/src/lib.rs:113`) is called only
  from the frontend `use-transcription.ts` invoke → its `provider` param can be
  dropped end-to-end.
- BYOK is **frontend/contract only** — no Rust touches it.
- **No i18n/locale copy** references Deepgram or BYOK. `transcriptionBlocked.*`
  keys are only button labels (`openPortal`, `notNow`); blocked title/message are
  hardcoded English in `lib/transcription/access.ts`.
- `AppState.deepgram_api_key` (`src-tauri/src/state.rs:10-11`) is already
  `#[expect(dead_code)]` — remove it.

---

## Phase 0 — Baseline

- Confirm a clean starting tree and green gates before touching anything:
  `npm run typecheck && npm run lint && npm test`, plus
  `cargo build` / `cargo test` under `src-tauri/`.
- Record the baseline so any post-change diff in behavior is attributable.

**Exit:** all gates green on an unmodified tree.

---

## Phase 1 — Rust: collapse to a Soniox-only backend

Delete Deepgram from the `lumenlive-stt` crate and the command layer.

1. **Delete files**
   - `src-tauri/crates/stt/src/deepgram.rs`
   - `src-tauri/crates/stt/src/rest.rs`
2. **`crates/stt/Cargo.toml`** — remove the `rest-fallback` feature and the now
   unused `optional` `reqwest` dependency (confirm no other module pulls
   `reqwest`; if it does, keep the dep but drop `optional`/feature). Remove the
   `[features]` block if it becomes empty.
3. **`crates/stt/src/lib.rs`**
   - Remove `pub mod deepgram;` and `pub mod rest;`.
   - Remove `pub use deepgram::DeepgramClient;`.
   - Drop `SttBackend` and `SttConfig` from the `pub use types::{...}` list.
   - Rewrite the crate module doc to describe Soniox as the sole backend; drop
     the `rest-fallback` feature-flag note and the `DeepgramClient`/`SttConfig`
     bullets.
4. **`crates/stt/src/types.rs`**
   - Delete the `SttBackend` enum.
   - Delete `SttConfig` and its `Default` impl.
   - Keep `Word`, `TranscriptEvent`, `SonioxConfig` (drop the "kept separate from
     `SttConfig`" phrasing in the `SonioxConfig` doc).
5. **`src-tauri/src/commands/stt/model.rs`**
   - Reduce to a single `build_provider(api_key) -> Box<dyn SttProvider>` that
     always builds `SonioxClient` from `SonioxConfig` (key via arg or
     `SONIOX_API_KEY` fallback).
   - Delete `build_deepgram`, `parse_backend`, and the
     `DeepgramClient` / `SttConfig` / `SttBackend` imports. Keep `resolve_key`.
   - Update the module doc (no more "branches on `SttBackend`").
6. **`src-tauri/src/commands/stt/mod.rs`**
   - Remove the `provider: Option<String>` parameter from `start_transcription`.
   - Replace the `parse_backend` + `build_provider(backend, api_key)` call with
     `build_provider(api_key)`.
   - Update the doc comment (step 2: "Connects to Soniox").
7. **`src-tauri/src/state.rs`** — remove the `deepgram_api_key` field and its
   initializer.
8. **`provider.rs` doc** — reword "Deepgram is the only backend" → Soniox.

**Exit:** `cargo build` + `cargo test` green; `cargo clippy` clean (watch for
newly-unused imports/deps).

---

## Phase 2 — Frontend: stop relaying a provider

1. **`src/hooks/use-transcription.ts`**
   - Remove the `provider` local and `provider = resolution.provider ?? "deepgram"`.
   - Drop `provider` from the `invoke("start_transcription", {...})` args.
   - Remove the `SttProviderId` import.
2. **`src/lib/transcription/types.ts`**
   - Delete the `SttProviderId` type.
   - Remove the `provider?: SttProviderId` field from `TranscriptionResolution`
     (LumenBO may still send it in JSON; TS ignores unknown fields — safe).
   - Reword the `keyExpiresAt` doc (drop the "Deepgram keys don't" contrast →
     just "temporary Soniox keys expire").

**Exit:** `npm run typecheck` green.

---

## Phase 3 — Remove BYOK from the contract, routing, and hook

1. **`src/lib/transcription/types.ts`**
   - `TranscriptionMode`: remove `"byok"` → `"platform_paid" | "platform_trial" | "blocked"`.
   - `BlockedReason`: remove `"byok_invalid"`.
   - `TranscriptionResolution`: remove `byokPresent`.
   - `TranscriptionStatus`: remove `byokRequired`, `byokConfigured`,
     `byokLast4`, `byokInvalid`.
2. **`src/lib/transcription/access.ts`**
   - Remove the `case "byok_invalid":` from `describeBlock`.
   - Reword `GENERIC_BLOCK` and the `allowance_exhausted` copy so they no longer
     tell users to "add your own Deepgram key" (see Phase 4).
3. **`src/hooks/use-transcription.ts`** — `stt_unauthorized` handler:
   - Delete the `wasByok` branch (`reportKeyInvalid`, `describeBlock("byok_invalid")`).
   - Collapse to the single generic "Transcription key rejected" toast.
   - Remove the `reportKeyInvalid` import and the now-unused `describeBlock`
     import if nothing else uses it.
   - Reword the `sessionMode` doc comment (drop the "a 401 on a `byok` session"
     explanation).
4. **`src/services/transcription-key-gateway.ts`**
   - Delete `reportKeyInvalid` and its `/v1/transcription/key-invalid` call.
   - Reword the file header (drop "talks to Deepgram directly"; the BYO-key
     sentence).

**Exit:** `npm run typecheck` green (expect test failures until Phase 5).

---

## Phase 4 — Copy / doc-comment sweep (Deepgram → Soniox, drop BYO phrasing)

User-facing strings (`access.ts`) and stale doc comments only — no logic.

1. **`src/lib/transcription/access.ts`** operator copy:
   - `GENERIC_BLOCK.message` → drop "add your own Deepgram key in the portal";
     e.g. "Transcription can't start right now. Check your account or upgrade."
   - `allowance_exhausted.message` → "You've used your free transcription
     minutes. Upgrade to keep transcribing." (no BYO-key suggestion).
2. **Doc comments** (cosmetic, keep density):
   - Frontend: `transcription-blocked-prompt.tsx:17`, `api-key-field.tsx:14`
     (drop "(Deepgram)"), `entitlements/index.ts:35` ("BYO Deepgram key" → plain
     "cloud transcription").
   - Rust: `keyterms.rs`, `supervisor.rs`, `events.rs`, and the detection crate
     (`quotation.rs`, `direct/parser.rs`, `semantic/normalize.rs`,
     `reading_mode.rs`) — replace "Deepgram" with "the STT" / "Soniox".

**Exit:** no remaining `deepgram`/`byok` (case-insensitive) in `src/**` or
`src-tauri/**` except intentional history — verify with a grep sweep.

---

## Phase 5 — Tests

1. **`src/lib/transcription/access.test.ts`**
   - Drop `byokPresent` from the fixture.
   - Remove the `byok` mode from the "starts for platform_paid and byok" case.
   - Remove the `byok_invalid` blocked-copy assertion; keep `platform_key_unset`.
2. **`src/hooks/use-transcription.test.ts`**
   - Remove all `byokPresent` fixture fields.
   - Delete the "defaults provider to deepgram" test and any
     `provider: "deepgram"` / `provider` invoke-arg assertions (the arg no longer
     exists).
   - Add/keep an assertion that `start_transcription` is invoked **without** a
     `provider` field.
3. Add a small Rust test (or assert via existing `model` tests if present) that
   `build_provider` yields a provider whose `name()` is `"soniox"`.

**Exit:** `npm test` and `cargo test` fully green.

---

## Phase 6 — Config + docs (mind the .md commit rule)

1. **`.env.template`** (committed): `DEEPGRAM_API_KEY="your_key_here"` →
   `SONIOX_API_KEY="your_key_here"`.
2. **`README.md`** and **`.github/SECURITY.md`**: update the stale Deepgram
   references to Soniox. **Edit but do not commit** (`.md` convention) — or skip
   entirely; flag to the user either way so the docs don't silently drift.

**Exit:** `.env.template` committed; `.md` drift flagged.

---

## Phase 7 — Final verification gate

- `npm run typecheck && npm run lint && npm test` — zero errors/warnings, suite green.
- `cargo build` + `cargo test` (+ `cargo clippy`) under `src-tauri/` — clean.
- Grep sweep: no lingering `deepgram` / `byok` references in `src/**` /
  `src-tauri/**` beyond intended.
- Report actual results honestly; do not claim success without a clean run.

---

## Out of scope (this repo)

- **LumenBO** server changes (stop offering a BYOK/Deepgram provider choice in
  the portal, retire `/v1/transcription/key-invalid`, remove BYO key storage/UI).
  This plan only removes the desktop's *client* side; the portal is a separate
  repo and should be sequenced alongside.

## Suggested commit slicing (main, no branches per repo convention)

1. `refactor(stt): remove Deepgram backend, Soniox is the only provider` (Phase 1–2)
2. `refactor(transcription): remove BYOK path` (Phase 3)
3. `chore(transcription): reword copy + docs to Soniox` (Phase 4, code only)
4. `test(transcription): update for Soniox-only, no BYOK` (Phase 5)
5. `chore(env): SONIOX_API_KEY in template` (Phase 6, code/config only)

(Each slice keeps all gates green so main is never red.)
