# Authentication redo

## Decision

Use browser-based sign-in as the primary authentication flow for LumenLive.

Sign-in is not only required for transcription. It identifies the user, activates the current device, verifies the subscription or trial, and unlocks Pro features. Free users can continue using the app without an account until they choose an account-based or Pro feature.

The browser should handle credential entry and account features. The desktop app should receive the authenticated session, activate the device, verify the license, and apply the entitlement.

## Account screen

Keep the current Account screen. After a successful browser sign-in, it should continue to display:

- User name and email
- Current plan
- Trial or access period
- Transcription usage
- Current device and device limits
- Revalidate and Sign out actions

Browser sign-in changes how the session is obtained. It does not replace the Account screen.

## Proposed flow

1. The user selects `Sign in` from Account or a Pro feature prompt.
2. LumenLive opens the browser login page.
3. The browser completes password, social login, passkey, verification, reset, or two-factor authentication.
4. The browser returns a short-lived, one-time authorization code to LumenLive through a deep link or localhost callback.
5. LumenLive exchanges the code for the existing bearer session.
6. LumenLive activates the current device and obtains a signed license token.
7. The app verifies the token locally and applies the plan entitlement.
8. The Account screen updates and the app resumes the action that requested sign-in when possible.

The callback must use state and PKCE. It must never place a bearer token in the browser URL.

## Required changes

### Desktop app

- Add a `startBrowserSignIn` flow.
- Show a pending state while the browser authentication is in progress.
- Listen for the deep-link or localhost callback.
- Exchange the one-time code for the existing session token and user details.
- Run the existing device activation and license verification flow.
- Route Account, Pro feature gates, and transcription prompts through the same sign-in action.
- Handle cancellation, timeout, offline errors, expired callbacks, and device-limit errors.
- Keep the existing persisted session and license behavior.

### Web app and backend

- Add a desktop-aware login handoff.
- Accept a registered LumenLive redirect URI or localhost callback.
- Issue a short-lived, one-time authorization code for the desktop app.
- Keep password, social login, passkey, email verification, reset, and two-factor flows in the browser.
- Preserve the existing bearer-session and license activation contracts.

### Tauri integration

- Add a secure deep-link or loopback callback mechanism.
- Register the callback scheme or port in the desktop bundle.
- Handle callbacks when LumenLive is already running.
- Prevent another app or browser page from injecting an unsolicited callback.

## Licensing and transcription safety

The transcription implementation should continue using the same authenticated session token. It should still:

- Request a server-issued transcription key for the activated device.
- Report transcription usage against that session.
- Enforce allowance and plan limits on the server.

The current licensing sequence must remain intact:

```text
browser authentication
  -> session token
  -> device activation
  -> signed license token
  -> offline license verification
  -> entitlement and Pro access
```

Do not treat successful browser authentication as successful device activation. If authentication succeeds but activation fails, such as when the device limit is reached, show the user as signed in but do not grant Pro access until activation succeeds.

## Main risks

- The user closes the browser before completing sign-in.
- The callback expires or returns to a closed app.
- Authentication succeeds but device activation fails.
- The user is offline after browser authentication.
- The session expires and transcription key requests return unauthorized.
- Multiple LumenLive windows compete to consume the same one-time callback.

## Acceptance criteria

- Account details and plan information remain visible as they are today.
- A user can sign in from Account or from any Pro feature prompt.
- A successful browser sign-in activates the current device and updates the plan badge.
- LumenLive restores the session and license after restart when still valid.
- Transcription key retrieval and usage reporting continue to use the existing session contract.
- Device-limit, expired-session, cancelled-login, and offline states give clear recovery actions.
- Sign out clears both the authenticated session and the local entitlement.
