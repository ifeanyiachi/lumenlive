# Browser authentication for LumenLive

## Decision

Use browser-based sign-in as LumenLive's primary authentication flow. The
browser handles credentials and account security. LumenLive receives a short-
lived authorization result, obtains its existing bearer session, activates the
current device for a selected team, verifies the signed license, and then
applies the resulting entitlement.

Authentication, device activation, licensing, and transcription access are
separate decisions:

```text
browser authentication
  -> desktop session
  -> team selection
  -> device activation for that team
  -> signed, team-scoped license
  -> offline license verification
  -> server-authorized transcription key
  -> feature and transcription access
```

Successful browser authentication alone must not grant Pro access or imply
that the device has been activated.

Free users can continue using the app without an account until they choose an
account-based or Pro feature. Transcription requires an authenticated and
activated desktop because the server issues the transcription key.

## Implementation status

- [x] Phase 1 — post-authentication pipeline
- [x] Phase 2 — desktop browser-login transaction
- [x] Phase 3 — Tauri callback integration
- [x] Phase 4 — account and feature entry points
- [x] Phase 5 — BYOK-safe transcription behavior
- [x] Phase 6 — session, licensing, and recovery hardening
- [x] Phase 7 — verification matrix

## Account screen

Keep the current Account screen and account menu. After browser authentication
and successful activation, it should display:

- User name and email
- Current team, when the account has multiple eligible teams
- Current plan and entitlement status
- Trial or subscription access period
- Transcription status and usage
- Whether transcription uses a platform key or a team BYOK key
- Current device and device limits
- Revalidate, team switch, and Sign out actions

Team BYOK does not behave like a finite platform allowance. Its usage status
should say that the team key is being used rather than displaying a platform
minute balance.

## Browser sign-in flow

1. The operator selects `Sign in` from the Account menu or a sign-in prompt.
2. LumenLive creates a login transaction containing a random `state`, a PKCE
   verifier, an expiry, and a pending-action identifier when a feature prompted
   the sign-in.
3. LumenLive opens the desktop-aware login page in the system browser.
4. The browser completes password, social login, passkey, email verification,
   password reset, or two-factor authentication.
5. The web application redirects to LumenLive with a short-lived, one-time
   authorization code and the `state` value.
6. LumenLive validates the state and exchanges the code plus the PKCE verifier
   for the existing bearer session and user details.
7. LumenLive lists the user's active, seated desktop teams.
8. If several teams are available, LumenLive asks the operator to choose one.
9. LumenLive activates the current device for the selected organization and
   receives a signed, team-scoped license token.
10. LumenLive verifies the license locally and applies its plan, feature, and
    device-limit claims.
11. The Account screen updates and the app resumes the action that requested
    sign-in when possible.

The browser callback must contain only the one-time code and state. It must
never contain a bearer session token, license token, team transcription key, or
password.

## Authentication and activation states

The desktop must represent these states separately:

- `anonymous`: no authenticated desktop session
- `authenticating`: browser login is in progress
- `authenticated`: the browser login succeeded and the desktop has a session,
  but device activation or team selection may still be pending
- `activated`: the device has a valid team-scoped license
- `activation_failed`: authentication succeeded, but activation failed because
  of a device limit, missing seat, offline state, or another backend error

If authentication succeeds but activation fails, retain the authenticated user
session but do not grant Pro features. Show the activation error and offer the
appropriate recovery action. A device-limit error must not be presented as a
bad-password error.

For multiple teams, the session may be held while the operator chooses a team,
but the app must not start transcription or apply a team entitlement until
activation completes. If the app closes during team selection, discard the
pending transaction and require a new sign-in or team selection.

## Team and license behavior

The authenticated session identifies the user. The selected organization
determines the license and transcription context for this desktop.

- The backend returns the teams available for desktop use.
- The operator selects a team when the account has more than one eligible team.
- Device activation receives the selected `organizationId`.
- The returned license is scoped to that organization.
- Team switching must revalidate team membership and activate the device again
  for the new organization.
- The app applies the new license only after local signature and machine checks
  succeed.
- A failed team switch must leave the previous valid team entitlement intact.
- The selected team may be persisted for convenience, but the server remains
  authoritative for current membership and seat availability.

Do not infer the active team from a browser cookie or from an unverified local
selection. The active team comes from successful device activation and the
verified license response.

## Transcription and BYOK safety

Browser authentication does not change the existing transcription contract.
The desktop continues to use the authenticated session and machine ID to ask
the server for a current transcription resolution.

The server may return:

- `platform_trial`
- `platform_paid`
- `team_byok`
- `blocked`, with a reason such as allowance exhaustion, missing team key, or
  disabled platform transcription

For a usable resolution, the server also identifies the STT provider and may
return a short-lived provider key. The desktop uses that key only for the
current transcription session. It must not persist the raw key in auth storage,
license storage, team storage, logs, browser URLs, or analytics.

The desktop must:

- Request the key only after authentication and device activation.
- Pass the machine ID with key retrieval and usage reporting.
- Use the server-selected STT provider.
- Re-pull a key after rotation, reconnect, or provider rejection.
- Report usage as server-accepted deltas using the same authenticated session.
- Treat `team_byok` as server-authorized transcription access, not as proof of
  a Pro plan or a finite platform allowance.
- Show specific recovery guidance for missing team keys and disabled platform
  transcription.

The server remains responsible for team-key ownership, allowance enforcement,
provider selection, key expiry, and usage attribution.

## Active transcription rules

Team changes and account changes must not leave a transcription session using
the wrong organization's key.

- Disable team switching while transcription is running, or stop transcription
  before switching teams.
- After a team switch, clear the old transcription status and require a fresh
  key pull before restarting.
- If the current session expires or a key request returns `401`, stop or pause
  transcription, show an expired-session state, and offer `Sign in again`.
- Do not silently interpret an expired bearer session as a missing team key.
- Sign out must stop active transcription before clearing the session, license,
  team, and usage state.

## Sign out

Sign out must perform these operations in order:

1. Stop active transcription and release the in-memory provider key.
2. Best-effort deactivate the current device on the server.
3. Clear the bearer session locally.
4. Clear the signed license and fall back to Free.
5. Clear the active team and persisted team selection.
6. Clear cached transcription status and remaining minutes.

If the network is unavailable, local sign-out still completes. The app must not
continue using a previously issued team key after sign-out.

## Callback transport

Use one of these desktop callback mechanisms:

- A registered `lumenlive://auth/callback` deep link; or
- A loopback callback on a random, short-lived `127.0.0.1` port.

The callback implementation must:

- Register the scheme or loopback listener in the Tauri desktop bundle.
- Validate `state` and PKCE before exchanging the code.
- Accept a callback only for an active, unexpired login transaction.
- Consume each authorization code once.
- Handle callbacks when LumenLive is already running.
- Bring the existing app window forward rather than starting a competing flow.
- Reject unsolicited, malformed, expired, or duplicate callbacks.
- Close the listener and clear the pending transaction on success, timeout, or
  cancellation.

## Planned implementation

### Phase 1: Extract the post-authentication pipeline — Done

Refactor the current direct-password flow so the code that follows
authentication accepts a common result such as `{ token, user }`. Keep the
existing team and licensing behavior in that pipeline:

1. Validate the authenticated user and email verification state.
2. Fetch the available desktop teams.
3. Select the default team or pause for operator selection.
4. Activate the device for the selected organization.
5. Verify and persist the returned license.
6. Persist the authenticated session as soon as authentication succeeds, while
   keeping the entitlement Free until activation succeeds.
7. Resume the pending feature action only after activation succeeds.

The direct email/password form can remain temporarily as a development or
fallback path, but browser sign-in becomes the production entry point.

### Phase 2: Add the desktop browser-login transaction — Done

Add a desktop authentication service that:

- Creates and stores the state, PKCE verifier, expiry, and pending action.
- Builds the desktop login URL.
- Opens it with the system browser.
- Exposes a pending/cancelled/timed-out result to the UI.
- Receives and validates the deep-link or loopback callback.
- Exchanges the one-time code for the existing bearer session contract.
- Prevents concurrent login transactions from consuming each other's callbacks.

The exchange response should preserve the existing `{ token, user }` shape so
team activation, licensing, and transcription do not depend on how the user
authenticated.

### Phase 3: Add Tauri callback integration

Add the selected deep-link or loopback mechanism to the Tauri application.
Register the desktop redirect, route callbacks to the existing process when
possible, and test packaged Windows behavior. The callback handler should live
at the native boundary and pass only validated data to the frontend.

### Phase 4: Update the account and feature entry points

- Replace the in-app email/password form with `Sign in in browser`.
- Show browser-login pending, cancelled, timed-out, and offline states.
- Keep the Account menu as the post-login status surface.
- Show team selection after authentication and before activation.
- Show the active team and team-switch errors.
- Route transcription prompts and Pro feature prompts through the same browser
  sign-in action.
- Resume the original feature action only after a valid entitlement exists.

### Phase 5: Integrate BYOK-safe transcription behavior — Done

- Keep `/v1/transcription/key` and `/v1/transcription/usage` bearer-
  authenticated.
- Include the machine ID in both requests.
- Preserve the server-selected provider and resolution mode.
- Keep raw provider keys in memory only.
- Clear transcription state on sign-out and team changes.
- Stop or block team switching during active transcription.
- Map expired-session responses to the browser sign-in flow.

### Phase 6: Harden session, licensing, and recovery behavior — Done

- Add explicit authenticated-but-not-activated state handling.
- Keep device-limit, missing-seat, missing-team-key, expired-session, cancelled,
  timeout, and offline errors distinct.
- Preserve the last valid entitlement when background revalidation fails for a
  temporary network reason.
- Downgrade to Free only when local license verification or server revalidation
  says the entitlement has ended.
- Clear stale team selection when the server removes the team.
- Ensure sign-out stops transcription before local credentials are removed.
- Keep the existing launch hydration and weekly revalidation behavior.

### Phase 7: Verification

Test at minimum:

- Successful browser sign-in with one team.
- Successful browser sign-in with multiple teams.
- Cancellation, timeout, expired state, duplicate callback, and malformed
  callback.
- Password, social login, passkey, email verification, reset, and two-factor
  browser flows where supported by the web application.
- Authentication success followed by device-limit or missing-seat failure.
- Team switching with valid and revoked membership.
- Platform trial, platform paid, team BYOK, missing team key, and disabled
  platform transcription.
- Provider selection for Deepgram and Soniox.
- Key rotation and provider rejection.
- Session expiry during key retrieval and usage reporting.
- Sign-out while transcription is active.
- Restart and offline launch with a still-valid persisted license.
- License downgrade, expired trial, and background revalidation failure.

## Backend and web requirements

The web application and backend must:

- Add a desktop-aware login handoff.
- Accept a registered LumenLive redirect URI or loopback callback.
- Validate state and PKCE.
- Issue a short-lived, one-time authorization code bound to the desktop login
  transaction.
- Exchange that code for the existing bearer session and user details.
- Keep password, social login, passkey, email verification, reset, and two-factor
  flows in the browser.
- Preserve the current team list, device activation, license validation,
  transcription-key, and usage-reporting contracts.
- Never include bearer tokens, license tokens, or provider keys in redirects.

## Acceptance criteria

- A user can start sign-in from Account or any account-based feature prompt.
- Credentials and account security flows occur in the browser.
- The callback uses state and PKCE and contains no bearer token or provider key.
- The desktop restores the authenticated session after a successful code
  exchange.
- A multi-team user selects a team before device activation.
- The license is scoped to the selected team and verified locally before access
  is granted.
- Authentication success and activation failure appear as separate states.
- A successful activation updates the plan, active team, and Account screen.
- Team BYOK transcription receives a server-authorized, short-lived key without
  persisting the raw key.
- Platform and team transcription modes show accurate usage status.
- Team switching cannot leave an active transcription session using the wrong
  team's key.
- Expired sessions offer a clear sign-in recovery path.
- Sign-out stops transcription, deactivates the device best-effort, clears the
  session and license, and returns the app to Free.
- LumenLive restores the session, active team, and license after restart when
  they remain valid.
- Transcription key retrieval and usage reporting continue to use the existing
  authenticated session contract.
