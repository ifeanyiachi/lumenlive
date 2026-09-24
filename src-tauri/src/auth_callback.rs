//! Native boundary for the browser sign-in deep link.
//!
//! The browser can invoke a custom URI scheme with arbitrary contents. Keep
//! URL parsing and filtering here, before anything is forwarded to the
//! webview. State and PKCE are still checked by the frontend transaction
//! service because the verifier intentionally never leaves that process.

use std::collections::VecDeque;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};
use url::Url;

pub const AUTH_CALLBACK_EVENT: &str = "lumenlive://auth-callback";

const MAX_VALUE_LENGTH: usize = 4096;
const MAX_PENDING_CALLBACKS: usize = 4;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCallbackPayload {
    pub code: Option<String>,
    pub state: String,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub error_uri: Option<String>,
}

#[derive(Default)]
pub struct AuthCallbackState {
    pending: VecDeque<AuthCallbackPayload>,
}

/// Consume callbacks received while the webview was not ready yet.
#[tauri::command]
pub fn consume_desktop_auth_callbacks(
    state: State<'_, Mutex<AuthCallbackState>>,
) -> Vec<AuthCallbackPayload> {
    let Ok(mut state) = state.lock() else {
        return Vec::new();
    };
    state.pending.drain(..).collect()
}

/// Install deep-link listeners and retain a startup callback until the
/// frontend has installed its listener. The deep-link plugin is configured in
/// `tauri.conf.json`, so packaged Windows builds register `lumenlive://` with
/// the installed executable.
pub fn initialize<R: Runtime>(app: &mut tauri::App<R>) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_deep_link::DeepLinkExt;

    #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
    app.deep_link().register_all()?;

    if let Some(urls) = app.deep_link().get_current()? {
        for url in urls {
            queue_startup_callback(app, &url);
        }
    }

    let app_handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            dispatch_live_callback(&app_handle, &url);
        }
    });

    Ok(())
}

/// Bring the current app window forward when a browser callback arrives.
pub fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    focus_window(&main);
}

fn focus_window<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn queue_startup_callback<R: Runtime>(app: &tauri::App<R>, url: &Url) {
    let Ok(payload) = validate_callback_url(url) else {
        log::warn!("Rejected malformed desktop auth callback during startup");
        return;
    };

    if let Some(state) = app.try_state::<Mutex<AuthCallbackState>>() {
        if let Ok(mut state) = state.lock() {
            enqueue(&mut state, payload);
        }
    }
}

fn dispatch_live_callback<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    let Ok(payload) = validate_callback_url(url) else {
        log::warn!("Rejected malformed desktop auth callback");
        return;
    };

    focus_main_window(app);
    let Some(main) = app.get_webview_window("main") else {
        queue_callback(app, payload);
        return;
    };

    if main.emit(AUTH_CALLBACK_EVENT, &payload).is_err() {
        queue_callback(app, payload);
    }
}

fn queue_callback<R: Runtime>(app: &AppHandle<R>, payload: AuthCallbackPayload) {
    let Some(state) = app.try_state::<Mutex<AuthCallbackState>>() else {
        return;
    };
    if let Ok(mut state) = state.lock() {
        enqueue(&mut state, payload);
    };
}

fn enqueue(state: &mut AuthCallbackState, payload: AuthCallbackPayload) {
    if state.pending.len() >= MAX_PENDING_CALLBACKS {
        state.pending.pop_front();
    }
    state.pending.push_back(payload);
}

fn validate_callback_url(url: &Url) -> Result<AuthCallbackPayload, &'static str> {
    if url.scheme() != "lumenlive"
        || url.host_str() != Some("auth")
        || url.path() != "/callback"
        || url.fragment().is_some()
        || url.username() != ""
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("callback target is not lumenlive://auth/callback");
    }

    let mut code = None;
    let mut state = None;
    let mut error = None;
    let mut error_description = None;
    let mut error_uri = None;

    for (key, value) in url.query_pairs() {
        if value.len() > MAX_VALUE_LENGTH {
            return Err("callback value is too long");
        }

        let target = match key.as_ref() {
            "code" => &mut code,
            "state" => &mut state,
            "error" => &mut error,
            "error_description" => &mut error_description,
            "error_uri" => &mut error_uri,
            _ => return Err("callback contains an unexpected parameter"),
        };

        if target.is_some() {
            return Err("callback contains a duplicate parameter");
        }
        *target = Some(value.into_owned());
    }

    let Some(state) = state.filter(|value| !value.is_empty()) else {
        return Err("callback has no state");
    };
    let has_code = code.as_ref().is_some_and(|value| !value.is_empty());
    let has_error = error.as_ref().is_some_and(|value| !value.is_empty());
    if has_code == has_error {
        return Err("callback must contain exactly one code or error");
    }

    Ok(AuthCallbackPayload {
        code: code.filter(|value| !value.is_empty()),
        state,
        error: error.filter(|value| !value.is_empty()),
        error_description,
        error_uri,
    })
}

#[cfg(test)]
mod tests {
    use super::validate_callback_url;
    use url::Url;

    #[test]
    fn accepts_only_the_expected_authorization_callback_shape() {
        let url = Url::parse(
            "lumenlive://auth/callback?code=one-time-code&state=transaction-state",
        )
        .unwrap();
        let callback = validate_callback_url(&url).unwrap();
        assert_eq!(callback.code.as_deref(), Some("one-time-code"));
        assert_eq!(callback.state, "transaction-state");
    }

    #[test]
    fn accepts_browser_declined_callbacks_without_a_code() {
        let url = Url::parse(
            "lumenlive://auth/callback?error=access_denied&state=transaction-state",
        )
        .unwrap();
        let callback = validate_callback_url(&url).unwrap();
        assert_eq!(callback.error.as_deref(), Some("access_denied"));
        assert!(callback.code.is_none());
    }

    #[test]
    fn rejects_credentials_fragments_duplicates_and_unknown_parameters() {
        for value in [
            "lumenlive://auth/callback?code=abc&state=state&token=secret",
            "lumenlive://auth/callback?code=abc&code=second&state=state",
            "lumenlive://auth/callback?code=abc&state=state#token=secret",
        ] {
            let url = Url::parse(value).unwrap();
            assert!(validate_callback_url(&url).is_err(), "{value}");
        }
    }

    #[test]
    fn requires_state_and_exactly_one_result() {
        for value in [
            "lumenlive://auth/callback?code=abc",
            "lumenlive://auth/callback?state=state",
            "lumenlive://auth/callback?code=abc&error=denied&state=state",
        ] {
            let url = Url::parse(value).unwrap();
            assert!(validate_callback_url(&url).is_err(), "{value}");
        }
    }
}
