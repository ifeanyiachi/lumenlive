# Soniox — Test Plan, Decisions & Remaining Work

Consolidated tracker for the Soniox STT trial. Supersedes the phased plan in
`soniox.md` for tracking *what's left*; `soniox.md` remains the historical
design/rationale record. Scratch/planning file — untracked, do not commit.

Status: **Provider fully implemented (Phases 1–4b done). Not yet validated on
real audio. Trial decision pending.**

---

## Locked decisions

1. **Trial shape: proper.** lumenbo mints keys and returns a `provider`
   discriminator; desktop builds the matching client. Not a client-side toggle.
2. **Provider selection is server-authoritative.** The church **admin** picks
   Deepgram vs Soniox in lumenbo; **no in-app user toggle**. The provider is
   inseparable from the key lumenbo mints (Soniox client + Deepgram key = auth
   failure). The `provider` param on `start_transcription` is the channel that
   carries lumenbo's decision down to the Rust client builder — **load-bearing,
   do not remove.**
3. **Abstraction: real enum** (`SttBackend { Deepgram, Soniox }`) in the STT
   crate, not a throwaway env gate. This is the version kept if Soniox wins.
4. **Admin provider setting is platform-wide**, not per-church (`stt_provider`
   row in the generic `app_settings` KV; no schema migration).
5. **Soniox key is admin-pasteable** (encrypted `app_settings.soniox_key`),
   resolved as **admin-stored ?? `SONIOX_API_KEY` env** (admin wins). Key and
   provider are stored separately so both providers stay configured and the
   toggle just picks which is live (no re-paste / desync on every flip).
6. **`max_session_duration_seconds` deliberately omitted** on temp-key mint — it
   would kill a multi-hour live stream mid-service. Anti-abuse = short mint
   window + minute metering.
7. **Soniox mint fails CLOSED** — never falls back to Deepgram/master key on a
   Soniox mint error (so `provider` always matches the key returned).
8. **BYOK + institution keys stay Deepgram** — only platform trial/paid paths
   honour the switch.
9. **Number formatting (Q1): SOLVED** ✅ — Soniox emits digit form for spoken
   verse references; no spoken-number→digit normalizer needed.

### Invariants (do not change)

- `SttProvider` trait and `TranscriptEvent` shape unchanged.
- Metering (`usage-meter.ts`, `/v1/transcription/usage`) unchanged and
  provider-agnostic.
- Deepgram remains the default until the trial says otherwise.
- No React/Zustand/Tauri imports in `crates/stt`; no `invoke`/`listen` outside a
  gateway on the frontend.

---

## Completed

- **Phase 1 — Provider crate (`crates/stt`).** `SttBackend` enum + `SonioxConfig`;
  `soniox.rs` `SonioxClient` implementing `SttProvider` (Deepgram task topology
  reused: blocking reader → tokio channel → ws writer + receiver; reconnect loop,
  timeouts). `SonioxAggregator` bridges per-token finality → Deepgram-shaped
  events. Full `bible_keyterms()` in `context.terms` (no 100-cap). 7 unit tests +
  clippy clean.
- **Phase 2 — Command wiring (`src-tauri`).** `build_provider(backend, api_key)`
  branches on the enum; `parse_backend()` maps the frontend discriminator;
  `start_transcription` gained optional `provider` (defaults Deepgram).
- **Phase 3 — Frontend relay.** `SttProviderId` type; `use-transcription.ts`
  reads `resolution.provider ?? "deepgram"` and relays it into the invoke. No
  toggle, no settings change. Full JS suite green.
- **Phase 4 — lumenbo contract.** Platform-wide admin provider setting
  (audit-logged); `POST /v1/transcription/key` stamps `provider` and mints a
  short-lived Soniox temp key when selected + configured; Deepgram path otherwise
  unchanged. 155 tests pass.
- **Phase 4b — Admin UX.** Soniox key pasteable/encrypted in admin UI; Soniox in
  the Balances table (real 30-day usage/spend; balance shows "N/A — no balance
  API" since Soniox enforces at request time).
- **Debug tooling — raw-frame dump** ✅ (this change). `SONIOX_DEBUG_FRAMES=1`
  appends one JSON line per received Soniox text frame to
  `<temp>/soniox-frames.jsonl`. Off = zero cost. Purpose: close the
  endpoint-marker (#1) and delta-vs-cumulative (#2) questions from a real
  service, since the aggregator otherwise consumes frames internally and a wrong
  assumption is invisible in the `[TRANSCRIPT]` logs.

---

## Open gaps (from the Soniox↔Deepgram gap analysis)

| # | Gap | Risk | Where |
|---|-----|------|-------|
| 1 | **`<end>` endpoint marker unverified.** All `Final` + `UtteranceEnd` emission hinges on a token whose text is `<end>`. If wrong → Partials forever, no Finals → semantic detection, reading-mode advance, and voice commands (all final-gated in `events.rs`) silently never fire. Direct-on-partials (panel) still works, masking it. | **High** | `soniox.rs:51`, `:461`, `:500` |
| 2 | **Delta vs cumulative finals.** Aggregator assumes newly-final tokens arrive once. Cumulative re-send → double-counted text (`"John 3:16 John 3:16"`). | **High** | `soniox.rs:471` |
| 3 | ~~Number formatting (digits vs words)~~ | **SOLVED** ✅ | — |
| 4 | **Temp-key reconnect.** In-Rust 2-attempt reconnect reuses the *same* temp key (short-lived ≤3600s). lumenbo re-pull only happens on full app restart, not the Rust retry loop. Late-service socket drop after key expiry → reconnect fails. Deepgram (long-lived key) has no equivalent. | **Medium** | `soniox.rs` connect loop |
| 5 | **No keep-alive / idle handling.** Deepgram sends KeepAlive every 5s idle; Soniox has none (empty msg = EOS). Fine for continuous capture; risk is a *stream gap* (between services / mic drop) tripping Soniox's idle timeout. | **Medium** | `soniox.rs` (vs `deepgram.rs:288`) |
| 6 | **`is_auth_error` is a broad guess.** Real bad-key `error_code` never captured. Mismatch → auth failure treated as transient (2 pointless retries + generic `ConnectionFailed` instead of `Unauthorized`, so app won't flag key as bad). | **Low** | `soniox.rs:362` |
| 7 | **Confidence semantics differ.** Deepgram = API utterance confidence; Soniox = mean of per-token confidences. Semantic panel-floor slider was tuned on Deepgram's distribution — may need retuning. | **Low/Medium** | `soniox.rs:503` |
| 8 | **`SpeechStarted` synthesized** on first content token vs Deepgram real VAD. Latency-attribution logging only — cosmetic. | Cosmetic | `soniox.rs:484` |

Moot (not a real gap): `punctuated_word` is always `None` on Soniox — but
`events.rs` drops the `words` array entirely, using only the transcript string +
confidence.

---

## Validation plan — two 30-minute recordings

### Setup
1. Build with the Soniox provider active (admin provider = Soniox, or
   `SONIOX_API_KEY` set for the dev path).
2. Set `SONIOX_DEBUG_FRAMES=1` to capture raw frames →
   `<temp>/soniox-frames.jsonl`.
3. Play recording A (≥30 min), then recording B (≥30 min). Keep the app logs.

### Closable from these runs

| Gap | Signal to read | "Closed" verdict |
|-----|----------------|------------------|
| **#1** | Presence + cadence of `[TRANSCRIPT] final:` (`events.rs:223`) and `[QUEUE] semantic_tx sent=N` climbing. Cross-check raw frames for what actually terminates an utterance. | Many short finals at natural boundaries + semantic count rising = closed. Only partials / one giant final = marker wrong. |
| **#2** | `[TRANSCRIPT] final:`/`partial:` text; confirm against raw frames (`is_final` interleave). | Clean non-repeating text across 60 min = delta holds. Duplication = cumulative, fix aggregator. |
| **#7** | `conf XX%` on every final line (`events.rs:224`) → build the distribution over 60 min, compare to Deepgram on similar audio. | Distribution characterized; decide whether to retune the panel-floor slider. Data, not binary. |
| **latency** | `[LATENCY] first partial/final … after speech-start` (`events.rs:168`, `:242`). | First-token latency captured vs Deepgram — the raw-speed number the trial wants. |

### NOT closable by playback (need targeted tests)

- **#4 temp-key reconnect** — a clean 30-min run won't reconnect, and temp keys
  live ≤60 min so expiry won't trigger; file playback likely uses the long-lived
  env key, not a minted temp key. Requires a forced mid-stream drop after the
  mint window with a *minted* key.
- **#5 keep-alive / idle** — playback streams PCM continuously (silence is still
  bytes), so the connection never goes truly idle. Requires an actual stream gap.
- **#6 bad-key / auth frame** — a good-key run never emits it. Separate ~5-second
  test: start once with a deliberately bad key and read the frame; then tighten
  `is_auth_error` to the real `error_code`.

---

## Remaining tasks

### Must-do before trial verdict
- [ ] Run the two 30-min playbacks with `SONIOX_DEBUG_FRAMES=1`; close **#1**,
      **#2**, characterize **#7**, record latency.
- [ ] Inspect `soniox-frames.jsonl`: confirm the real endpoint marker and the
      final/non-final interleave. Adjust `is_endpoint_marker` /
      `SonioxAggregator` + tests if they differ from assumptions.
- [ ] Bad-key run → capture the auth error frame → tighten `is_auth_error`
      (`soniox.rs:362`) + test (**#6**).

### Should-do (robustness)
- [ ] Forced mid-stream disconnect after key expiry → decide temp-key reconnect
      strategy: longer mint window vs bubbling a Soniox reconnect up to a fresh
      key pull (**#4**).
- [ ] Confirm Soniox idle-timeout behavior on a stream gap; decide whether a
      keep-alive equivalent is needed (**#5**).

### Phase 5 — Tests & gates (from soniox.md, still open)
- [ ] Rust: Deepgram path proven unchanged (no shared-code regression).
- [ ] `npm run typecheck && npm run lint && npm test` all clean, reported
      honestly.
- [ ] `cargo test -p lumenlive-stt` + clippy clean after any aggregator changes.

### Phase 6 — A/B trial & decision
- [ ] Run Soniox on one live service; compare accuracy (references + proper
      nouns), latency, and cost vs Deepgram.
- [ ] Decide: keep both, switch, or revert.

### Future cleanup (only if Soniox stays)
- [ ] Revisit env-var key fallbacks (`SONIOX_API_KEY` / `DEEPGRAM_API_KEY`) —
      prune **both** together for parity if pruned. **Keep the `provider` param
      on `start_transcription`** (server-authoritative channel, not a toggle).
- [ ] If the trial picks one provider, delete the loser's client + config + enum
      branch and collapse `build_provider` to a single path.
