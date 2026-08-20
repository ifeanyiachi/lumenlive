# NDI Usage & Feature Audit — Findings + Phased Plan

Scope: the full NDI send path — the Rust FFI sender, the Tauri command layer, the
two TS gateways, and the frame-capture loop in the broadcast output window.

Files reviewed:

- `src-tauri/crates/broadcast/src/ndi.rs` — FFI sender, `NdiRuntime`, `ActiveNdiSession`
- `src-tauri/src/commands/broadcast.rs` — `start_ndi` / `stop_ndi` / `get_ndi_status` / `push_ndi_frame`
- `src-tauri/src/lib.rs` — state registration
- `src/services/ndi-gateway.ts`, `src/services/ndi-output-gateway.ts` — IPC gateways
- `src/lib/broadcast/ndi.ts`, `src/lib/broadcast-output/frame.ts`, `src/lib/broadcast-output/surface.ts`
- `src/broadcast-output.tsx` — capture + push loop
- `src/components/broadcast/broadcast-settings.tsx` — start/stop/config orchestration
- `src/types/ndi.ts`, `data/download-ndi-sdk.ts`

---

## Findings

### F1 — Alpha / transparency output is dead: a keyable feed is impossible (High)

The NDI feed is read straight off the same canvas that `draw()` paints, and
**every** `draw()` branch fills an opaque black background before drawing
content:

- verse, transparent theme — `broadcast-output.tsx:509-510`
- media mode — `:432-433`
- transparent slide/song — `:468`
- Clear — `:423-424`
- no-data fallback — `:501-502`

`send_frame_rgba` faithfully copies canvas alpha for `StraightAlpha` /
`PremultipliedAlpha` (`ndi.rs:328-331`), but the alpha channel is always `255`
because the canvas was pre-filled black. The default mode is `straightAlpha`
(`broadcast-settings.tsx:529`), which implies a keyable/overlay feed is the
intent — yet a downstream switcher keying on it only ever sees opaque black
where the background should be transparent.

Net: the alpha-mode selector is effectively inert; the transparency feature does
not work end-to-end.

Root cause: `draw()` is shared by the on-screen preview and the NDI capture, and
the preview wants an opaque black backdrop. There is no NDI-specific transparent
render path.

### F2 — NDI declares an NTSC-fractional frame rate that doesn't match the push cadence (Medium)

`ndi.rs:346-347`:

```rust
frame_rate_n: (self.info.fps * 1000) as i32,
frame_rate_d: 1001,
```

This declares 23.976 / 29.97 / 59.94 fps to receivers. But the UI labels these
"24 / 30 / 60" and the JS push gate emits frames at exactly the integer rate:

`frame.ts:43` — `const minInterval = 1000 / (fps || 24)`.

Declared rate ≠ produced rate → receivers see clock drift / periodic reconcile
(roughly one extra frame every ~33s at 30). Correct value is `frame_rate_d:
1000` (or `n = fps, d = 1`) so the declaration matches the integer cadence the
app actually runs.

### F3 — `push_ndi_frame` runs heavy work under a global mutex on the main thread (Medium)

`push_ndi_frame` is a synchronous `pub fn` (`broadcast.rs:368-369`), so Tauri
executes it on the main thread. Each call:

- does a full RGBA→BGRA per-pixel conversion — up to ~33 MB at 4K, ~8 MB at 1080p
  (`ndi.rs:323-332`),
- calls the blocking `NDIlib_send_send_video_v2` FFI (`ndi.rs:361-363`),
- all while holding the single shared `Mutex<NdiRuntime>` (`lib.rs:29`),
- at up to 60 fps.

Consequences:

1. Main-thread jank in the control UI at high fps / resolution.
2. `main` and `alt` outputs serialize on the *same* mutex, contending
   frame-for-frame when both are live.

Fix direction: make the command `async fn` so Tauri runs it off the main thread.
No `await` is held across the lock, so the `std::sync::Mutex` guard remains
valid. (Optionally, per-session locking so main/alt don't contend.)

### F4 — `premultipliedAlpha` never premultiplies (Low)

`send_frame_rgba` copies `px[3]` verbatim for both `StraightAlpha` and
`PremultipliedAlpha`, and always uses the straight-alpha `BGRA` fourcc
(`ndi.rs:328-331`, `:345`). `PremultipliedAlpha` is byte-identical to
`StraightAlpha` — the option does nothing. Latent until F1 is fixed, but it is a
no-op today.

### F5 — Per-session `NDIlib_destroy()` is process-global; fragile with two sessions (Low, lower confidence)

Each `ActiveNdiSession` calls `NDIlib_initialize()` on create (`ndi.rs:253`) and
`NDIlib_destroy()` on `Drop` (`ndi.rs:374-384`). With both `main` and `alt`
sessions active, stopping one calls `NDIlib_destroy()` globally. NDI's
init/destroy are reference-counted in the SDK, so this most likely balances —
but the code relies on that implicitly, with no guard or comment. If the
refcount is ever not 1:1 (e.g. a partially failed init), stopping one output
could tear NDI down under the other.

Fix direction: hoist init/destroy to `NdiRuntime` with an explicit
init-once / destroy-on-last-session refcount.

### F6 — No Rust tests for the NDI module (Low)

`ndi.rs` has no `#[cfg(test)]`, unlike the rest of the crate and the CLAUDE.md
testing rules. The RGBA→BGRA conversion, alpha-mode branching, and
dimension/buffer-size validation are pure and directly testable without loading
the real library (extract the conversion into a free function).

### Verified correct (no action)

- `fourcc = u32::from_le_bytes(*b"BGRA")` and BGRA byte ordering — correct
  (`ndi.rs:322-345`).
- `frame_format_type: 1` = progressive; `timecode: i64::MAX` = synthesize — correct.
- Linux library candidates match `download-ndi-sdk.ts` output paths (`ndi.rs:393-397`).
- Surface precedence (NDI wins) and dimension-mismatch rescale in
  `pushNdiFrame` — correct (`surface.ts:51-70`, `broadcast-output.tsx:668-682`).
- Tauri camelCase→snake_case arg mapping for the gateways — correct.

---

## Progress

- **Phase 1 — DONE & verified.** F2: `ndi_frame_rate()` returns integer `fps/1`
  (was NTSC `fps*1000/1001`). F3: `push_ndi_frame` is now `async fn` (off the
  main thread). `cargo test`/`cargo check -p lumenlive`/clippy/typecheck clean.
- **Phase 2 — DONE & verified.** Extracted `validate_frame_dimensions()` and
  `rgba_to_bgra()` as pure functions; 11 colocated tests incl. a parity test vs
  the original inline loop and a 4K no-overflow check. All green; clippy clean.
- **Phase 3 — DONE & verified (chose P3-a: remove).** Dropped
  `PremultipliedAlpha`/`premultipliedAlpha` from the Rust enum, the `NdiAlphaMode`
  TS union, and the settings UI options. Default stays `straightAlpha`. Rust
  tests (11) + clippy + `cargo check -p lumenlive` clean; TS typecheck + lint
  clean; NDI vitest suites (7) green.
- **Phase 4 — DONE & verified (P4-key, Option B).** User confirmed keyable
  output is wanted. Implemented an isolated foreground-only NDI render pass:
  - New pure rule `shouldSendTransparentNdi()` (`lib/broadcast-output/ndi-key.ts`)
    + 10 tests — keys only transparent verse/slide content with no opaque base
    theme / media layer behind it, and never during black/logo/clear/media/stage.
  - New `drawNdiForeground()` in the output window renders verse text / slide
    elements + foreground overlays onto a transparent canvas (no black floor, no
    base theme, no media layer). The opaque push path is left byte-identical for
    every non-keyed case.
  - Threaded `alphaMode` end-to-end: `NdiConfigEventPayload`, both gateways,
    `syncNdiConfigToOutput` + all call sites, session-based `emitNdiConfig`, and
    the Rust `get_ndi_status` response (so a window opening mid-session picks it
    up). Straight alpha already passes through in the Rust sender (Phase 2/3).
  - Relabeled the two alpha options to plain language: "Solid background (full
    picture)" / "Transparent background (for overlay/keying)".
  - Gates: full eslint, 830 vitest tests, typecheck, `cargo check`/clippy — all
    clean.
- **Phase 5 — DONE & verified.** Hoisted `NDIlib_initialize`/`NDIlib_destroy`
  out of the per-session path into a shared `NdiLibrary` owned by `NdiRuntime`
  via `Arc`. It loads + initializes once on first `start` and destroys exactly
  once, when the last reference drops at shutdown. `ActiveNdiSession::drop` now
  destroys only its own sender, so stopping one of two concurrent outputs
  (`main` + `alt`) no longer deinitializes NDI under the other. Field/drop order
  ensures senders tear down before the library. `cargo test` (11) + clippy
  (warning-clean) + `cargo check -p lumenlive` all pass.

  Verification gap (same class as the keying live test): the two-session
  refcount behavior is covered by design + review, not a unit test — a
  library-loading test would create real NDI senders and could trip a Windows
  firewall prompt or network flakiness in `cargo test`/CI, so it was
  deliberately omitted. Validate with a live dual-output (main + alt) smoke test:
  start both, stop one, confirm the other keeps sending.

Migration note: an output config persisted with `alphaMode: "premultipliedAlpha"`
is no longer a valid value. In practice the settings dialog seeds its request
from local state defaulting to `straightAlpha` (not the persisted field), so no
stale value reaches the Rust command — but if that wiring changes, add a coercion
of unknown modes to `straightAlpha` before calling `start_ndi`.

### Note on Phase 3 (premultiplied alpha) — needs a decision

While implementing Phase 2 it became clear Phase 3 is **not** a mechanical fix.
NDI's `NDIlib_FourCC_type_BGRA` is defined as **straight (non-premultiplied)**
alpha — there is no premultiplied BGRA fourcc in the standard NDI set. The
capture source (canvas `getImageData`) is already straight alpha. So:

- Premultiplying B/G/R while still tagging the frame `BGRA` would hand a receiver
  premultiplied data it interprets as straight → **wrong colors on edges**.
- The only NDI-correct output is straight passthrough (what `StraightAlpha`
  already does).

So "make premultiplied real" has three honest options, and this is a product
call, not a code detail:

- **P3-a — Remove the `premultipliedAlpha` option.** It has no correct NDI
  meaning for output; drop it from the UI/type and default to `straightAlpha`.
  (Simplest; recommended unless a specific downstream consumer needs it.)
- **P3-b — Keep it but premultiply anyway**, for a specific downstream compositor
  that expects premultiplied pixels in a BGRA frame. Only correct for that
  consumer; document it as such.
- **P3-c — Defer** and fold into the Phase 4 transparency work, since it is
  invisible until F1 is fixed anyway.

Recommendation: **P3-a** (remove) or **P3-c** (defer) — do not silently
implement premultiplication, which would be wrong for the general NDI case.

## Phased Implementation Plan

Each phase is independently landable and ends on a clean
`npm run typecheck && npm run lint && npm test` (plus `cargo build`/`cargo test`
for Rust phases). Per CLAUDE.md, new/changed `lib`/Rust logic ships with
colocated tests; output-preserving Rust changes get a parity test.

### Phase 1 — Low-risk correctness (F2, F3)

Small, safe, high value; no user-visible behavior change beyond fixing the wire
declaration and moving work off the main thread.

1. **F2 frame rate.** Change `frame_rate_d` to `1000` in `ndi.rs:342-355`.
   Add a Rust test asserting `frame_rate_n / frame_rate_d` equals the selected
   integer fps for 24/30/60.
2. **F3 threading.** Convert `push_ndi_frame` to `async fn`
   (`broadcast.rs:368`). Confirm no lock guard crosses an `await`. Optionally
   split the per-output lock so main/alt don't serialize (defer if it widens the
   diff).

Gate: `cargo build` + `cargo test`, full JS suite.

### Phase 2 — Extract + test the conversion (F6, sets up F4)

Refactor with a parity test so later alpha work is provably safe.

1. Extract the RGBA→BGRA + alpha-mode logic from `send_frame_rgba` into a pure
   `fn rgba_to_bgra(dst: &mut [u8], rgba: &[u8], alpha: NdiAlphaMode)`.
2. Colocated `ndi.rs` tests: opaque forces 255; straight passes alpha through;
   dimension/buffer-size validation returns the right errors.

Gate: `cargo test` proves the extracted path is byte-identical to today's loop.

### Phase 3 — Make premultiplied real (F4)

1. Implement premultiplication in `rgba_to_bgra` for `PremultipliedAlpha`
   (multiply B/G/R by `a/255`).
2. Extend Phase 2 tests with premultiplied expectations.

Note: still invisible until F1, but now the mode is honest. Land with F1 or just
before it.

### Phase 4 — Codebase verification (updated after reading the live-output path)

Reviewing `live-output-panel.tsx`, `broadcast-output.tsx`, `resolveBaseTheme`,
and the background type unions (`types/canvas.ts:117`, `types/slide.ts:160`,
`types/broadcast.ts:200-204`) changes the framing of F1:

- **`transparent` is an internal compositing concept, not an output one.** A
  theme/slide with a transparent background is defined to composite *over the
  central base background*, not to make the program feed transparent.
- **The program is always opaque by design.** Every `draw()` branch paints a
  black floor, then base-theme + media-layer + content. `resolveBaseTheme` falls
  back to the output's own theme, so there is always an opaque backdrop.
- **No key/fill or overlay-only path exists** anywhere in the live pipeline. The
  NDI feed is a straight opaque mirror of the program.
- After Phase 3, both remaining alpha modes (`noneOpaque`, `straightAlpha`)
  produce opaque output here, because the floor is always painted.

**Therefore F1 is a product decision, not a plumbing choice:**

- **P4-none — keyable output not wanted.** Then F1 is *not a bug*. Remove the
  alpha-mode selector entirely and always send opaque (`straightAlpha` is now
  redundant with `noneOpaque`). Small simplification; closes F1/F4 completely.
- **P4-key — keyable output wanted.** A real new feature: a dedicated
  foreground-only NDI render pass (Option B below) that, *only for
  transparent-background verse/slide/song content*, skips the black floor +
  base-theme + media-layer fills and emits straight alpha. Opaque themes / media
  / web stay opaque (cannot be keyed). Requires threading `alphaMode` +
  per-content transparency into the output window.

Recommendation: confirm intent first. If keying isn't a real workflow, do
P4-none and skip the render-path work entirely.

### Phase 4 (P4-key only) — Transparent NDI render path (F1)

This is the only phase needing a product call, because `draw()` is shared by the
opaque preview and the NDI capture.

Decision needed (pick one):

- **Option A — background-transparency flag.** When the active theme/slide
  background is `transparent` AND the output's alpha mode ≠ `noneOpaque`, skip
  the black `fillRect` and `clearRect` instead, so canvas alpha survives. The
  on-screen confidence preview would then show a checkerboard/neutral backing via
  CSS rather than baked-in black.
- **Option B — dedicated NDI capture canvas.** Render a second time into the
  offscreen `ndiCanvasRef` without the black fill for NDI only, leaving the
  preview untouched. Costs one extra render per pushed frame (mitigated by the
  fps gate) but keeps the preview exactly as-is.

Recommendation: **Option B** — it isolates the change to the NDI path, avoids
regressing the preview, and is the smaller behavioral blast radius. Cost is
bounded by the existing push-rate gate.

Steps (Option B):

1. Factor the content-draw so it can render onto an arbitrary ctx with a
   `fillBackground: boolean` param (default true for preview).
2. In `pushNdiFrame`, when alpha mode ≠ opaque and background is transparent,
   render into the NDI canvas with `fillBackground:false`.
3. Thread the active alpha mode into the output window (extend
   `NdiConfigEventPayload` with `alphaMode`, populate from the session in
   `emitNdiConfig`/`syncNdiConfigToOutput`).
4. Tests: surface/precedence unchanged; a render test proving transparent-bg
   frames keep alpha < 255 in background regions while opaque mode stays 255.

Gate: full suite + manual verify against an NDI receiver (keying test).

### Phase 5 — Init/destroy refcount hardening (F5)

1. Move `NDIlib_initialize`/`NDIlib_destroy` ownership into `NdiRuntime` with an
   explicit active-session refcount: initialize on first session, destroy on
   last.
2. Test: start two sessions, drop one, assert the runtime still reports the other
   active and does not destroy globally (mock the FFI or gate behind a
   library-present check).

Gate: `cargo test`; manual dual-output (main + alt) smoke test.

---

## Suggested order & sizing

| Phase | Findings | Risk | Size | Blocking? |
|------|----------|------|------|-----------|
| 1 | F2, F3 | Low | S | no |
| 2 | F6 | Low | S | enables 3/4 |
| 3 | F4 | Low | S | pairs with 4 |
| 4 | F1 | Med (needs decision) | M | product call |
| 5 | F5 | Low | S | no |

Phases 1, 2, 5 can land immediately. Phase 4 is the one that restores the
advertised keyable-output feature and needs the Option A/B decision before code.
