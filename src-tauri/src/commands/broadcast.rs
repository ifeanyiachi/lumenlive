#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use lumenlive_broadcast::ndi::{NdiRuntime, NdiSessionInfo, NdiStartRequest};

/// Map `output_id` to Tauri window label. Supports N outputs.
fn window_label(output_id: &str) -> String {
    if output_id == "main" {
        "broadcast".to_string()
    } else {
        format!("broadcast-{output_id}")
    }
}

/// Map `output_id` to the web overlay window label. Supports N outputs.
fn web_overlay_label(output_id: &str) -> String {
    if output_id == "main" {
        "web-overlay".to_string()
    } else {
        format!("web-overlay-{output_id}")
    }
}

/// Map `output_id` to broadcast-output.html URL with hash fragment.
/// Uses a fragment instead of query params so the `PathBuf` conversion
/// on Windows does not interfere with URL resolution.
fn window_url(output_id: &str, mode: &str) -> String {
    format!("broadcast-output.html#output={output_id}&mode={mode}")
}

/// Config for a controllable `YouTube` overlay. When `video_id` is present the
/// overlay loads the bundled web-overlay.html (hosting the YT `IFrame` Player
/// API) instead of navigating straight to youtube.com/embed.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WebOverlayConfig {
    pub video_id: Option<String>,
    pub start: Option<f64>,
    pub end: Option<f64>,
    pub is_live: Option<bool>,
    pub muted: Option<bool>,
}

/// Build the web-overlay.html URL with hash fragment from the overlay config.
fn web_overlay_url(output_id: &str, cfg: &WebOverlayConfig) -> String {
    use std::fmt::Write;
    let mut hash = format!("output={output_id}");
    if let Some(v) = &cfg.video_id {
        let _ = write!(hash, "&videoId={v}");
    }
    if let Some(s) = cfg.start {
        if s > 0.0 {
            let _ = write!(hash, "&start={s}");
        }
    }
    if let Some(e) = cfg.end {
        if e > 0.0 {
            let _ = write!(hash, "&end={e}");
        }
    }
    if cfg.is_live.unwrap_or(false) {
        hash.push_str("&live=1");
    }
    if cfg.muted.unwrap_or(false) {
        hash.push_str("&muted=1");
    }
    format!("web-overlay.html#{hash}")
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors
        .iter()
        .map(|m| {
            let size = m.size();
            MonitorInfo {
                name: m.name().cloned().unwrap_or_else(|| "Unknown".to_string()),
                width: size.width,
                height: size.height,
            }
        })
        .collect())
}

/// Ensure the broadcast window for a given output exists (creates hidden if not).
#[tauri::command]
pub async fn ensure_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    mode: Option<String>,
    name: Option<String>,
) -> Result<(), String> {
    let label = window_label(&output_id);
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }
    let mode_str = mode.as_deref().unwrap_or("normal");
    let title = name
        .as_deref().map_or_else(|| format!("LumenLive NDI {output_id}"), |n| format!("LumenLive - {n}"));
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(window_url(&output_id, mode_str).into()),
    )
    .title(&title)
    .inner_size(1920.0, 1080.0)
    .visible(false)
    .skip_taskbar(true)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    monitor_index: usize,
    mode: Option<String>,
    name: Option<String>,
) -> Result<(), String> {
    let label = window_label(&output_id);
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let monitor = monitors
        .get(monitor_index)
        .ok_or_else(|| format!("Monitor index {monitor_index} out of range"))?;

    let pos = monitor.position();
    let size = monitor.size();

    // If window already exists (e.g. hidden for NDI), reuse it.
    // A window created by `ensure_broadcast_window` for NDI is borderless,
    // non-closable/minimizable and hidden from the taskbar. Restore those
    // properties here so a reused window is actually usable as a preview
    // (otherwise it opens with no title bar, no min/close buttons and no
    // taskbar entry — appearing blank and stuck).
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: pos.x,
                y: pos.y,
            }))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: size.height,
            }))
            .map_err(|e| e.to_string())?;
        let _ = window.set_decorations(false);
        let _ = window.set_closable(false);
        let _ = window.set_minimizable(false);
        let _ = window.set_skip_taskbar(false);
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_focus();
        return Ok(());
    }

    let mode_str = mode.as_deref().unwrap_or("normal");
    let title = name
        .as_deref().map_or_else(|| match mode_str {
            "stage" => "Stage Display".to_string(),
            _ => format!("Projector - {output_id}"),
        }, |n| format!("LumenLive - {n}"));

    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(window_url(&output_id, mode_str).into()),
    )
    .title(&title)
    .position(f64::from(pos.x) + 50.0, f64::from(pos.y) + 50.0)
    .inner_size(f64::from(size.width) - 100.0, f64::from(size.height) - 100.0)
    .decorations(false)
    .closable(false)
    .minimizable(false)
    .always_on_top(false)
    .skip_taskbar(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn close_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<(), String> {
    // Close any web overlay sitting on top of this broadcast window
    let overlay_label = web_overlay_label(&output_id);
    if let Some(overlay) = app.get_webview_window(&overlay_label) {
        let _ = overlay.close();
    }

    let label = window_label(&output_id);
    if let Some(window) = app.get_webview_window(&label) {
        let ndi_active = runtime
            .lock()
            .map_err(|e| e.to_string())?
            .is_active(&output_id);
        if ndi_active {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Open a borderless web overlay window on top of the broadcast output.
/// Uses a real Tauri webview (not an iframe) so X-Frame-Options cannot block it.
#[tauri::command]
pub async fn open_web_overlay(
    app: tauri::AppHandle,
    output_id: String,
    url: String,
    config: Option<WebOverlayConfig>,
) -> Result<(), String> {
    let label = web_overlay_label(&output_id);
    let broadcast_label = window_label(&output_id);

    // Close existing overlay if any
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.close();
    }

    // Require the broadcast window to be open
    let Some(broadcast_win) = app.get_webview_window(&broadcast_label) else {
        return Ok(());
    };

    let pos = broadcast_win.outer_position().map_err(|e| e.to_string())?;
    let size = broadcast_win.outer_size().map_err(|e| e.to_string())?;

    // YouTube → controllable bundled page (hosts the IFrame Player API).
    // Anything else → navigate the webview straight to the URL.
    let webview_url = match &config {
        Some(cfg) if cfg.video_id.is_some() => {
            WebviewUrl::App(web_overlay_url(&output_id, cfg).into())
        }
        _ => {
            let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
            WebviewUrl::External(parsed)
        }
    };

    WebviewWindowBuilder::new(&app, &label, webview_url)
        .title("Web Overlay")
        .position(f64::from(pos.x), f64::from(pos.y))
        .inner_size(f64::from(size.width), f64::from(size.height))
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Mute or unmute the web overlay by toggling the <video> element's muted property.
/// Retries a few times since the video element may not exist yet when the page is loading.
#[tauri::command]
pub async fn mute_web_overlay(app: tauri::AppHandle, output_id: String, muted: bool) -> Result<(), String> {
    let label = web_overlay_label(&output_id);
    if let Some(overlay) = app.get_webview_window(&label) {
        let val = if muted { "true" } else { "false" };
        let js = format!(
            r"(function m(n){{
                var vids=document.querySelectorAll('video');
                vids.forEach(function(v){{v.muted={val};}});
                if(vids.length===0&&n<10)setTimeout(function(){{m(n+1);}},500);
            }})(0);"
        );
        overlay.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close the web overlay window for a given output.
#[tauri::command]
pub async fn close_web_overlay(app: tauri::AppHandle, output_id: String) -> Result<(), String> {
    let label = web_overlay_label(&output_id);
    if let Some(overlay) = app.get_webview_window(&label) {
        overlay.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn start_ndi(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: NdiStartRequest,
) -> Result<NdiSessionInfo, String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime
        .start(output_id, request)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_ndi(output_id: String, runtime: State<'_, Mutex<NdiRuntime>>) -> Result<(), String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime.stop(&output_id);
    Ok(())
}

#[derive(Serialize)]
pub struct NdiStatusResponse {
    pub active: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[tauri::command]
pub fn get_ndi_status(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<Option<NdiStatusResponse>, String> {
    let runtime = runtime.lock().map_err(|e| e.to_string())?;
    match runtime.current_info(&output_id) {
        Some(info) => Ok(Some(NdiStatusResponse {
            active: true,
            width: info.width,
            height: info.height,
            fps: info.fps,
        })),
        None => Ok(None),
    }
}

/// Read a required `u32` metadata header from the IPC request.
fn frame_header_u32(request: &tauri::ipc::Request<'_>, name: &str) -> Result<u32, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| format!("push_ndi_frame: missing/invalid header {name}"))
}

#[tauri::command]
pub fn push_ndi_frame(
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    // Frame pixels arrive as a raw binary body (no base64/JSON) with width,
    // height and the output id carried in headers.
    let rgba_data = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.as_slice(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("push_ndi_frame: expected a raw binary body".to_string())
        }
    };
    let output_id = request
        .headers()
        .get("x-output-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("main")
        .to_string();
    let width = frame_header_u32(&request, "x-width")?;
    let height = frame_header_u32(&request, "x-height")?;

    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime
        .send_frame_rgba(&output_id, width, height, rgba_data)
        .map_err(|e| e.to_string())
}
