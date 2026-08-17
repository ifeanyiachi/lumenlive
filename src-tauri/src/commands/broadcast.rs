#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use lumenlive_broadcast::ndi::{NdiRuntime, NdiSessionInfo, NdiStartRequest};

/// Extra `WebView2` (Windows) browser flags for every window.
///
/// `--disable-direct-composition-video-overlays` is the load-bearing one: without
/// it `WebView2` presents hardware-decoded video through a `DirectComposition`
/// overlay that the page's own bitmap never sees, so `ctx.drawImage(video)`
/// captures a black frame. The audience output window paints ALL video to a 2D
/// canvas (theme/idle/Clear backgrounds, slide backgrounds, live media) and that
/// canvas is both what the projector shows and what NDI reads back via
/// `getImageData` — so the overlay made video vanish on the external monitor and
/// NDI alike while the DOM `<video>` operator previews kept working. Disabling the
/// overlay routes the decoded frames back into the page bitmap (hardware decode is
/// retained), making canvas capture read real pixels.
///
/// `--autoplay-policy=no-user-gesture-required` is the second load-bearing flag:
/// the audience output window plays the live-media `<video>` (and program audio)
/// unmuted, started by a Tauri *event* handler — there is no user gesture inside
/// the output webview, so `WebView2`'s default autoplay policy blocks `play()` and
/// the video sticks on its first frame ("video won't play on the projector").
/// Relaxing the policy lets the app-controlled output start playback on its own.
///
/// The `--disable-features=...` prefix re-states wry's own default
/// (`msWebOOUI,msPdfOOUI,msSmartScreenProtection`), which setting this arg would
/// otherwise replace. `WebView2` shares one browser environment across every window
/// in the process, so this string is applied identically to the main window (in
/// `tauri.conf.json`) and to each broadcast window below to avoid a mismatch.
pub const WEBVIEW_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-direct-composition-video-overlays --autoplay-policy=no-user-gesture-required";

/// Map `output_id` to Tauri window label. Supports N outputs.
fn window_label(output_id: &str) -> String {
    if output_id == "main" {
        "broadcast".to_string()
    } else {
        format!("broadcast-{output_id}")
    }
}

/// Map `output_id` to broadcast-output.html URL with hash fragment.
/// Uses a fragment instead of query params so the `PathBuf` conversion
/// on Windows does not interfere with URL resolution.
fn window_url(output_id: &str, mode: &str) -> String {
    format!("broadcast-output.html#output={output_id}&mode={mode}")
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
    .additional_browser_args(WEBVIEW_BROWSER_ARGS)
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

    // Reuse an existing window (e.g. one created hidden for NDI) or create it.
    // A window created by `ensure_broadcast_window` for NDI is borderless,
    // non-closable/minimizable and hidden from the taskbar. Whether reused or
    // freshly built, the geometry below is applied the same way so both paths
    // fill the target monitor identically.
    let window = if let Some(window) = app.get_webview_window(&label) {
        window
    } else {
        let mode_str = mode.as_deref().unwrap_or("normal");
        let title = name.as_deref().map_or_else(
            || match mode_str {
                "stage" => "Stage Display".to_string(),
                _ => format!("Projector - {output_id}"),
            },
            |n| format!("LumenLive - {n}"),
        );

        WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::App(window_url(&output_id, mode_str).into()),
        )
        .title(&title)
        .additional_browser_args(WEBVIEW_BROWSER_ARGS)
        .decorations(false)
        .closable(false)
        .minimizable(false)
        // Deliberately NOT always-on-top. The projector is a *shared* display:
        // mid-service the operator often brings another app forward on it (a
        // browser video, a Chrome page) for the congregation, then switches back
        // to Lumen. Pinning the output on top would trap the projector on Lumen
        // and make that impossible. Instead the operator returns to Lumen with
        // the explicit `focus_broadcast_window` raise (see below), mirroring how
        // a normal presentation output yields to and reclaims a shared screen.
        .always_on_top(false)
        // The output is a display *surface*, not a second app. Keep it out of the
        // taskbar / alt-tab so the operator only ever manages the main control
        // window (the ProPresenter / EasyWorship model: one window, output lives
        // only on the projector). The operator's preview is the in-app Live Output
        // panel, not this window.
        .skip_taskbar(true)
        .focused(false)
        // Build hidden; the exact monitor geometry is applied in *physical*
        // pixels below, then the window is shown. The builder's `.position` /
        // `.inner_size` take *logical* units, so passing a monitor's physical
        // size/position through them mis-sizes the window on any display whose
        // DPI scale factor isn't 100% — the window overflows or lands partly
        // off-screen. Setting physical geometry after build avoids that.
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?
    };

    let _ = window.set_decorations(false);
    let _ = window.set_closable(false);
    let _ = window.set_minimizable(false);
    // Explicitly NOT always-on-top (see builder comment): the projector is a
    // shared display the operator switches other apps onto and back. Clear the
    // flag on the reuse path too in case a prior call had raised it.
    let _ = window.set_always_on_top(false);
    // Keep the surface hidden from the taskbar / alt-tab on the reuse path too
    // (a window created hidden for NDI is already skip_taskbar; a freshly built
    // one is set above). See the builder comment for the rationale.
    let _ = window.set_skip_taskbar(true);

    // Clear any prior fullscreen first: a window that is already fullscreen
    // ignores set_position/set_size, so a reused window (or one being moved to a
    // different monitor) would stay put. Drop out of fullscreen, reposition, then
    // re-enter below.
    let _ = window.set_fullscreen(false);

    // First place the window *on* the target monitor using physical coordinates
    // (scale-factor-independent), sized to that monitor. This both seeds the
    // borderless-fill fallback and — crucially — puts the window on the correct
    // display so the fullscreen call below covers the right monitor.
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

    window.show().map_err(|e| e.to_string())?;

    // Then lock it into true fullscreen on that monitor. A borderless window
    // merely *sized* to the monitor can still be nudged by the OS window frame /
    // drop shadow, leaving a few-pixel offset — the symptom reported. Real
    // fullscreen has the compositor own the whole display, so the output is
    // edge-to-edge with no offset regardless of DPI or window chrome. Tauri uses
    // borderless (not exclusive) fullscreen on Windows, so always-on-top overlays
    // and alt-tab still behave normally.
    let _ = window.set_fullscreen(true);

    // Do NOT leave focus on the output surface — that's what makes it feel like a
    // second app has taken over. Hand focus straight back to the main control
    // window so the operator never loses their workspace. (If the main window
    // isn't found, we simply leave focus where the compositor put it.)
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.set_focus();
    }

    Ok(())
}

/// Bring the broadcast output window back to the front on its monitor.
///
/// The projector is a shared display: the operator can move another app (a
/// browser video, a Chrome page) over the output mid-service, then wants to
/// return to Lumen. Because the output is borderless and hidden from the
/// taskbar/alt-tab, the OS gives the operator no handle to raise it again — so
/// this command is that handle, wired to a UI control.
///
/// Raising is done with a momentary always-on-top pulse rather than
/// `set_focus`: toggling topmost on then off lifts the window above the
/// currently-foreground window (e.g. Chrome) and leaves it at the top of the
/// normal z-band, without permanently pinning it (which would re-trap the
/// projector) and without stealing keyboard focus from the operator's control
/// window on the laptop screen.
#[tauri::command]
pub async fn focus_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
) -> Result<(), String> {
    let label = window_label(&output_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_always_on_top(true);
        let _ = window.set_always_on_top(false);
    }
    Ok(())
}

#[tauri::command]
pub async fn close_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<(), String> {
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
#[serde(rename_all = "camelCase")]
pub struct NdiStatusResponse {
    pub active: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub alpha_mode: lumenlive_broadcast::ndi::NdiAlphaMode,
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
            alpha_mode: info.alpha_mode,
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

// The NDI encode + network send in `send_frame_rgba` is genuinely blocking, and
// output windows call this once per frame. An `#[tauri::command] async fn` runs
// on Tauri's async runtime, so doing the blocking send inline would occupy a
// runtime worker for the whole encode/send every frame and back up the runtime
// that also services the operator window's other invokes/events — the projector
// being "on" then froze the operator's controls. So we hand the owned frame to
// `spawn_blocking`, which runs it on the dedicated blocking pool and leaves the
// async runtime free. The `NdiRuntime` mutex is locked and released inside the
// blocking closure (the guard never crosses threads), so `std::sync::Mutex` is
// safe here. The pixel body is copied once (`to_vec`) to own it across the
// thread boundary — far cheaper than stalling the runtime.
#[tauri::command]
pub async fn push_ndi_frame(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    // Frame pixels arrive as a raw binary body (no base64/JSON) with width,
    // height and the output id carried in headers.
    let rgba_data: Vec<u8> = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
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

    tokio::task::spawn_blocking(move || {
        let runtime = app.state::<Mutex<NdiRuntime>>();
        let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
        runtime
            .send_frame_rgba(&output_id, width, height, &rgba_data)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
