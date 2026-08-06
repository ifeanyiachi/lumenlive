use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State as AxumState,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tower_http::cors::CorsLayer;

use crate::command::RemoteCommand;
use crate::dispatch::{CommandDispatcher, CommandSink};
use crate::error::CommandError;

/// Configuration for the HTTP API server.
#[derive(Debug, Clone)]
pub struct HttpConfig {
    pub port: u16,
    pub host: String,
    /// Shared-secret access token. When `Some`, the `/status` and `/control`
    /// endpoints require it via `Authorization: Bearer <token>` (or the
    /// `X-Auth-Token` header); requests without a matching token get `401`.
    /// When `None`, no authentication is enforced (not recommended when bound
    /// to a non-loopback address).
    pub auth_token: Option<String>,
}

impl Default for HttpConfig {
    fn default() -> Self {
        Self {
            port: 8080,
            host: "0.0.0.0".into(),
            auth_token: None,
        }
    }
}

/// Generate a random access token for the HTTP control API.
///
/// Returns a 32-character hex string (122 bits of entropy from a `UUIDv4`),
/// unguessable enough to gate LAN control while remaining easy to type or
/// encode in a QR code for a phone/tablet remote.
#[must_use]
pub fn generate_auth_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Constant-time string comparison to avoid leaking the token via timing.
///
/// The length check can leak the token length, but the token length is fixed
/// and public, so this is not a meaningful side channel.
fn tokens_match(presented: &str, expected: &str) -> bool {
    let (a, b) = (presented.as_bytes(), expected.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Returns `true` if the request is authorized: either no token is configured
/// (auth disabled) or the request presents the matching token via
/// `Authorization: Bearer <token>` or the `X-Auth-Token` header.
fn is_authorized(expected: Option<&str>, headers: &HeaderMap) -> bool {
    let Some(expected) = expected else {
        return true; // auth disabled
    };
    let presented = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| {
            v.strip_prefix("Bearer ")
                .or_else(|| v.strip_prefix("bearer "))
        })
        .or_else(|| headers.get("x-auth-token").and_then(|v| v.to_str().ok()));
    presented.is_some_and(|p| tokens_match(p, expected))
}

/// Standard `401 Unauthorized` response for a missing/incorrect token.
fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(ControlResponse {
            success: false,
            error: Some("Missing or invalid access token".into()),
        }),
    )
        .into_response()
}

/// Handle to a running HTTP server. Call `stop()` to shut it down.
pub struct HttpHandle {
    shutdown_tx: Option<watch::Sender<bool>>,
}

impl HttpHandle {
    /// Signal the HTTP server to stop gracefully.
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(true);
        }
    }

    /// Check if the handle still has a shutdown sender (server not yet stopped).
    pub fn is_active(&self) -> bool {
        self.shutdown_tx.is_some()
    }
}

impl Drop for HttpHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Result of starting the HTTP server.
pub struct HttpStartResult {
    pub handle: HttpHandle,
    pub bound_port: u16,
}

/// Shared state for axum route handlers.
struct AppState<S: CommandSink> {
    sink: Arc<S>,
    status: Arc<tokio::sync::RwLock<StatusSnapshot>>,
    auth_token: Option<String>,
}

/// Snapshot of the current application state, served by `GET /api/v1/status`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatusSnapshot {
    pub on_air: bool,
    pub active_theme: Option<String>,
    pub live_verse: Option<String>,
    pub queue_length: usize,
    pub confidence_threshold: f32,
    pub active_schedule_item: Option<String>,
    pub active_alerts: Vec<String>,
}

/// Shared, thread-safe status snapshot that the frontend pushes updates to.
pub type SharedStatus = Arc<tokio::sync::RwLock<StatusSnapshot>>;

/// Create a new shared status snapshot with default values.
pub fn new_shared_status() -> SharedStatus {
    Arc::new(tokio::sync::RwLock::new(StatusSnapshot::default()))
}

/// Start the HTTP API server.
///
/// Binds to `config.host:config.port` and serves the `/api/v1/` endpoints.
/// Uses `tauri::async_runtime::spawn` compatible futures (runs on the Tauri-managed Tokio runtime).
///
/// # Errors
///
/// Returns `CommandError::DispatchFailed` if the TCP listener cannot bind.
pub async fn start_http_server<S>(
    config: HttpConfig,
    sink: Arc<S>,
    status: SharedStatus,
) -> Result<HttpStartResult, CommandError>
where
    S: CommandSink + 'static,
{
    let bind_addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .map_err(|e| CommandError::DispatchFailed(format!("Invalid bind address: {e}")))?;

    let state = Arc::new(AppState {
        sink,
        status,
        auth_token: config.auth_token.clone(),
    });

    // CORS stays permissive so any remote UI (a phone browser on an arbitrary
    // LAN origin) can reach the API. CORS is not the security boundary here —
    // the access token gating `/status` and `/control` is. A cross-origin page
    // cannot forge a token it does not know.
    let app = Router::new()
        .route("/api/v1/health", get(health_handler))
        .route("/api/v1/status", get(status_handler::<S>))
        .route("/api/v1/control", post(control_handler::<S>))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(bind_addr).await.map_err(|e| {
        CommandError::DispatchFailed(format!("Failed to bind HTTP on {bind_addr}: {e}"))
    })?;

    let bound_port = listener.local_addr().map_or(config.port, |a| a.port());

    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    tokio::spawn(async move {
        log::info!("HTTP API server started on {bind_addr} (port {bound_port})");

        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                while !*shutdown_rx.borrow_and_update() {
                    if shutdown_rx.changed().await.is_err() {
                        break;
                    }
                }
                log::info!("HTTP API server shutting down");
            })
            .await
            .unwrap_or_else(|e| log::error!("HTTP server error: {e}"));

        log::info!("HTTP API server stopped");
    });

    Ok(HttpStartResult {
        handle: HttpHandle {
            shutdown_tx: Some(shutdown_tx),
        },
        bound_port,
    })
}

// --- Route handlers ---

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health_handler() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok",
        service: "lumenlive",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn status_handler<S: CommandSink + 'static>(
    AxumState(state): AxumState<Arc<AppState<S>>>,
    headers: HeaderMap,
) -> Response {
    if !is_authorized(state.auth_token.as_deref(), &headers) {
        return unauthorized();
    }
    let snapshot = state.status.read().await;
    Json(snapshot.clone()).into_response()
}

#[derive(Deserialize)]
struct ControlRequest {
    #[serde(flatten)]
    command: RemoteCommand,
}

#[derive(Serialize)]
struct ControlResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn control_handler<S: CommandSink + 'static>(
    AxumState(state): AxumState<Arc<AppState<S>>>,
    headers: HeaderMap,
    Json(request): Json<ControlRequest>,
) -> Response {
    if !is_authorized(state.auth_token.as_deref(), &headers) {
        return unauthorized();
    }
    match CommandDispatcher::dispatch(&request.command, &*state.sink) {
        Ok(()) => (
            StatusCode::OK,
            Json(ControlResponse {
                success: true,
                error: None,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ControlResponse {
                success: false,
                error: Some(e.to_string()),
            }),
        )
            .into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::test_support::RecordingSink as MockSink;

    #[tokio::test]
    async fn http_server_binds_and_stops() {
        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();
        let config = HttpConfig {
            port: 0,
            host: "127.0.0.1".into(),
            auth_token: None,
        };

        let mut result = start_http_server(config, sink, status)
            .await
            .expect("should bind");
        assert!(result.bound_port > 0);
        assert!(result.handle.is_active());

        result.handle.stop();
        // Give the server a moment to shut down
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(!result.handle.is_active());
    }

    /// Helper: send a raw HTTP request and return the response as a string.
    async fn raw_http_request(port: u16, method: &str, path: &str, body: Option<&str>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let mut stream = tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .expect("connect");

        let body_str = body.unwrap_or("");
        let request = if body.is_some() {
            format!(
                "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_str}",
                body_str.len()
            )
        } else {
            format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
        };

        stream.write_all(request.as_bytes()).await.expect("write");

        let mut response = String::new();
        stream.read_to_string(&mut response).await.expect("read");
        response
    }

    #[tokio::test]
    async fn health_endpoint_returns_ok() {
        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();
        let config = HttpConfig {
            port: 0,
            host: "127.0.0.1".into(),
            auth_token: None,
        };

        let result = start_http_server(config, sink, status)
            .await
            .expect("should bind");
        let port = result.bound_port;

        // Give server a moment to start accepting
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let resp = raw_http_request(port, "GET", "/api/v1/health", None).await;
        assert!(resp.contains("200 OK"), "Expected 200, got: {resp}");
        assert!(resp.contains("\"status\":\"ok\""));
        assert!(resp.contains("\"service\":\"lumenlive\""));

        let mut handle = result.handle;
        handle.stop();
    }

    #[tokio::test]
    async fn status_endpoint_returns_snapshot() {
        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();

        // Pre-populate status
        {
            let mut s = status.write().await;
            s.on_air = true;
            s.confidence_threshold = 0.75;
        }

        let config = HttpConfig {
            port: 0,
            host: "127.0.0.1".into(),
            auth_token: None,
        };

        let result = start_http_server(config, sink, status)
            .await
            .expect("should bind");
        let port = result.bound_port;

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let resp = raw_http_request(port, "GET", "/api/v1/status", None).await;
        assert!(resp.contains("200 OK"), "Expected 200, got: {resp}");
        assert!(resp.contains("\"on_air\":true"));
        assert!(resp.contains("\"confidence_threshold\":0.75"));

        let mut handle = result.handle;
        handle.stop();
    }

    #[tokio::test]
    async fn control_endpoint_dispatches_command() {
        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();
        let config = HttpConfig {
            port: 0,
            host: "127.0.0.1".into(),
            auth_token: None,
        };

        let result = start_http_server(config, sink.clone(), status)
            .await
            .expect("should bind");
        let port = result.bound_port;

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let body = r#"{"command":"next"}"#;
        let resp = raw_http_request(port, "POST", "/api/v1/control", Some(body)).await;
        assert!(resp.contains("200 OK"), "Expected 200, got: {resp}");
        assert!(resp.contains("\"success\":true"));

        // Give dispatch a moment
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert!(sink.command_count() > 0, "Sink should have received command");

        let mut handle = result.handle;
        handle.stop();
    }

    #[tokio::test]
    async fn port_conflict_returns_error() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();

        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();
        let config = HttpConfig {
            port,
            host: "127.0.0.1".into(),
            auth_token: None,
        };

        let result = start_http_server(config, sink, status).await;
        assert!(result.is_err());
    }

    /// Helper: send an HTTP request with an optional extra header line.
    async fn raw_http_request_hdr(
        port: u16,
        method: &str,
        path: &str,
        body: Option<&str>,
        header: Option<&str>,
    ) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let mut stream = tokio::net::TcpStream::connect(format!("127.0.0.1:{port}"))
            .await
            .expect("connect");

        let hdr = header.map(|h| format!("{h}\r\n")).unwrap_or_default();
        let body_str = body.unwrap_or("");
        let request = if body.is_some() {
            format!(
                "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\n{hdr}Content-Length: {}\r\nConnection: close\r\n\r\n{body_str}",
                body_str.len()
            )
        } else {
            format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{hdr}Connection: close\r\n\r\n")
        };

        stream.write_all(request.as_bytes()).await.expect("write");
        let mut response = String::new();
        stream.read_to_string(&mut response).await.expect("read");
        response
    }

    /// When an access token is configured, `/control` and `/status` reject
    /// requests without the matching token (401) and accept those that carry it,
    /// while `/health` stays open for liveness checks.
    #[tokio::test]
    async fn auth_token_gates_control_and_status() {
        let sink = Arc::new(MockSink::new());
        let status = new_shared_status();
        let config = HttpConfig {
            port: 0,
            host: "127.0.0.1".into(),
            auth_token: Some("s3cret-token".into()),
        };

        let result = start_http_server(config, sink.clone(), status)
            .await
            .expect("should bind");
        let port = result.bound_port;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // No token → control rejected with 401, command NOT dispatched.
        let body = r#"{"command":"next"}"#;
        let resp = raw_http_request_hdr(port, "POST", "/api/v1/control", Some(body), None).await;
        assert!(resp.contains("401"), "Expected 401 without token, got: {resp}");
        assert_eq!(sink.command_count(), 0, "unauthorized command must not dispatch");

        // Wrong token → still 401.
        let resp = raw_http_request_hdr(
            port,
            "POST",
            "/api/v1/control",
            Some(body),
            Some("X-Auth-Token: wrong"),
        )
        .await;
        assert!(resp.contains("401"), "Expected 401 with wrong token, got: {resp}");

        // Correct token via X-Auth-Token → dispatched.
        let resp = raw_http_request_hdr(
            port,
            "POST",
            "/api/v1/control",
            Some(body),
            Some("X-Auth-Token: s3cret-token"),
        )
        .await;
        assert!(resp.contains("200 OK"), "Expected 200 with token, got: {resp}");

        // Correct token via Authorization: Bearer → status returned.
        let resp = raw_http_request_hdr(
            port,
            "GET",
            "/api/v1/status",
            None,
            Some("Authorization: Bearer s3cret-token"),
        )
        .await;
        assert!(resp.contains("200 OK"), "Expected 200 status with bearer, got: {resp}");

        // Status without token → 401.
        let resp = raw_http_request_hdr(port, "GET", "/api/v1/status", None, None).await;
        assert!(resp.contains("401"), "Expected 401 status without token, got: {resp}");

        // Health stays open regardless.
        let resp = raw_http_request_hdr(port, "GET", "/api/v1/health", None, None).await;
        assert!(resp.contains("200 OK"), "Health should stay open, got: {resp}");

        let mut handle = result.handle;
        handle.stop();
    }
}
