# LumenLive project manager

This file tracks delivery of the browser-authentication redesign described in
[`authredo.md`](authredo.md). `authredo.md` remains the technical source of
truth; this file records ownership, status, and the next delivery target.

## Current status

Phase 2 is complete. The next target is Phase 3: native Tauri callback
integration.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 1 | Shared post-authentication pipeline | Done |
| 2 | Browser login transaction and PKCE exchange | Done |
| 3 | Tauri deep-link callback integration | Next |
| 4 | Browser sign-in account and feature entry points | Planned |
| 5 | BYOK-safe transcription integration | Planned |
| 6 | Session, licensing, and recovery hardening | Planned |
| 7 | End-to-end verification matrix | Planned |

## Completed

### Phase 1

- Authentication now flows through a shared `{ token, user }` pipeline.
- The authenticated session persists before team lookup and device activation.
- Team selection and activation failures remain separate from entitlement state.
- The signed license is applied only after local verification succeeds.

### Phase 2

- Desktop login transactions generate state and PKCE values in memory.
- Login URLs use the `lumenlive://auth/callback` redirect.
- Transactions expire after ten minutes and reject concurrent attempts.
- Callbacks validate origin, state, expiry, and allowed parameters.
- Authorization codes are consumed before exchange and cannot be exchanged twice.
- The exchange returns the existing `{ token, user }` contract.

## Next action: Phase 3

1. Register `lumenlive://auth/callback` in the Tauri bundle.
2. Forward callbacks to the existing application window.
3. Pass only the validated callback URL to the frontend auth service.
4. Test packaged Windows behavior, duplicate launches, and app relaunches.

## Verification baseline

- Full test suite: 178 files, 1,469 tests passing.
- TypeScript typecheck: passing.
- ESLint: passing.
- Production build: passing.
