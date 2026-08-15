use std::ffi::{c_void, CString};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use libloading::{Library, Symbol};
use serde::{Deserialize, Serialize};
use thiserror::Error;

type NdiSendInstance = *mut c_void;
type NdiInitializeFn = unsafe extern "C" fn() -> bool;
type NdiDestroyFn = unsafe extern "C" fn();
type NdiSendCreateFn = unsafe extern "C" fn(*const NdiSendCreate) -> NdiSendInstance;
type NdiSendDestroyFn = unsafe extern "C" fn(NdiSendInstance);
type NdiSendVideoV2Fn = unsafe extern "C" fn(NdiSendInstance, *const NdiVideoFrameV2);

#[repr(C)]
struct NdiSendCreate {
    p_ndi_name: *const i8,
    p_groups: *const i8,
    clock_video: bool,
    clock_audio: bool,
}

#[repr(C)]
struct NdiVideoFrameV2 {
    xres: i32,
    yres: i32,
    fourcc: u32,
    frame_rate_n: i32,
    frame_rate_d: i32,
    picture_aspect_ratio: f32,
    frame_format_type: i32,
    timecode: i64,
    p_data: *mut u8,
    line_stride_in_bytes: i32,
    p_metadata: *const i8,
    timestamp: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiStartRequest {
    pub source_name: String,
    pub resolution: NdiResolution,
    pub frame_rate: NdiFrameRate,
    pub alpha_mode: NdiAlphaMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiResolution {
    R720p,
    R1080p,
    R4k,
}

impl NdiResolution {
    pub fn dimensions(&self) -> (u32, u32) {
        match self {
            Self::R720p => (1280, 720),
            Self::R1080p => (1920, 1080),
            Self::R4k => (3840, 2160),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiFrameRate {
    Fps24,
    Fps30,
    Fps60,
}

impl NdiFrameRate {
    pub fn fps(&self) -> u32 {
        match self {
            Self::Fps24 => 24,
            Self::Fps30 => 30,
            Self::Fps60 => 60,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NdiAlphaMode {
    NoneOpaque,
    /// Straight (non-premultiplied) alpha — the only alpha model NDI's BGRA
    /// fourcc supports, and what canvas `getImageData` already produces.
    StraightAlpha,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NdiSessionInfo {
    pub source_name: String,
    pub resolution: NdiResolution,
    pub frame_rate: NdiFrameRate,
    pub alpha_mode: NdiAlphaMode,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[non_exhaustive]
#[derive(Debug, Clone, Error)]
pub enum NdiError {
    #[error("NDI source name must not be empty")]
    EmptySourceName,
    #[error("unable to locate NDI library at {0}")]
    LibraryNotFound(String),
    #[error("failed to load NDI library: {0}")]
    LibraryLoad(String),
    #[error("failed to load symbol {symbol}: {message}")]
    SymbolLoad {
        symbol: &'static str,
        message: String,
    },
    #[error("NDI initialization failed")]
    InitializeFailed,
    #[error("failed to create NDI sender instance")]
    SenderCreateFailed,
    #[error("NDI session is not active")]
    SessionNotActive,
    #[error("frame dimensions do not match active NDI settings ({expected_width}x{expected_height})")]
    FrameDimensionsMismatch {
        expected_width: u32,
        expected_height: u32,
    },
    #[error("frame buffer size is invalid for dimensions {width}x{height}")]
    InvalidFrameBufferSize { width: u32, height: u32 },
}

/// The loaded NDI shared library: the DLL handle plus the send/destroy function
/// pointers, loaded and `NDIlib_initialize`d exactly once and then shared by
/// every session via `Arc`.
///
/// NDI's `NDIlib_initialize`/`NDIlib_destroy` are process-global. The previous
/// design loaded the library and called both per-session, so stopping one of two
/// concurrent outputs (`main` + `alt`) called `NDIlib_destroy()` globally and
/// could tear NDI down under the still-running output. Centralizing here means
/// `initialize` runs once on first use and `destroy` runs once — when the last
/// reference (held by `NdiRuntime`, outliving all sessions) is dropped at
/// shutdown.
struct NdiLibrary {
    _library: Library,
    send_create: NdiSendCreateFn,
    send_destroy: NdiSendDestroyFn,
    send_video: NdiSendVideoV2Fn,
    ndi_destroy: NdiDestroyFn,
}

// SAFETY: NdiLibrary is only ever reached behind the app-state Mutex. It owns the
// library handle and raw C function pointers, which have no thread affinity.
unsafe impl Send for NdiLibrary {}
unsafe impl Sync for NdiLibrary {}

impl NdiLibrary {
    /// Load the NDI DLL, resolve the required symbols, and call
    /// `NDIlib_initialize` once. Fails if the library is missing, a symbol is
    /// absent, or initialization is refused.
    fn load() -> Result<Self, NdiError> {
        let library_path = resolve_library_path()?;
        // SAFETY: library_path was validated to exist by resolve_library_path()
        let library = unsafe { Library::new(&library_path) }
            .map_err(|e| NdiError::LibraryLoad(e.to_string()))?;

        let initialize = *load_symbol::<NdiInitializeFn>(&library, b"NDIlib_initialize\0", "NDIlib_initialize")?;
        let ndi_destroy = *load_symbol::<NdiDestroyFn>(&library, b"NDIlib_destroy\0", "NDIlib_destroy")?;
        let send_create = *load_symbol::<NdiSendCreateFn>(&library, b"NDIlib_send_create\0", "NDIlib_send_create")?;
        let send_destroy = *load_symbol::<NdiSendDestroyFn>(&library, b"NDIlib_send_destroy\0", "NDIlib_send_destroy")?;
        let send_video =
            *load_symbol::<NdiSendVideoV2Fn>(&library, b"NDIlib_send_send_video_v2\0", "NDIlib_send_send_video_v2")?;

        // SAFETY: initialize is a valid function pointer loaded from the NDI library.
        if !unsafe { initialize() } {
            return Err(NdiError::InitializeFailed);
        }

        Ok(Self {
            _library: library,
            send_create,
            send_destroy,
            send_video,
            ndi_destroy,
        })
    }
}

impl Drop for NdiLibrary {
    fn drop(&mut self) {
        // Runs once, when the last Arc (held by NdiRuntime, which outlives every
        // session) is dropped — i.e. at app shutdown, after all senders are gone.
        // SAFETY: ndi_destroy is a valid function pointer; the library is dropped
        // after this via the `_library` field.
        unsafe { (self.ndi_destroy)() };
    }
}

#[derive(Default)]
pub struct NdiRuntime {
    // Declared before `library` so sessions (and their senders) drop first, then
    // the shared library's `NDIlib_destroy` runs last.
    sessions: std::collections::HashMap<String, ActiveNdiSession>,
    /// Lazily loaded on first `start`, then reused by every session and kept
    /// alive for the runtime's lifetime.
    library: Option<Arc<NdiLibrary>>,
}

impl std::fmt::Debug for NdiRuntime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NdiRuntime")
            .field("active_sessions", &self.sessions.len())
            .field("library_loaded", &self.library.is_some())
            .finish()
    }
}

impl NdiRuntime {
    /// Check if a specific session is active.
    pub fn is_active(&self, session_id: &str) -> bool {
        self.sessions.contains_key(session_id)
    }

    /// Check if any session is active.
    pub fn any_active(&self) -> bool {
        !self.sessions.is_empty()
    }

    pub fn start(
        &mut self,
        session_id: String,
        request: NdiStartRequest,
    ) -> Result<NdiSessionInfo, NdiError> {
        // Stop existing session with this ID if running
        if let Some(existing) = self.sessions.remove(&session_id) {
            log::info!("NDI[{session_id}]: shutting down existing session before restart");
            drop(existing);
        }

        log::info!("NDI[{session_id}]: starting session '{}'", request.source_name);

        // Load (and NDIlib_initialize) the shared library once; reuse it for
        // every subsequent session so init/destroy are never per-session.
        let library = if let Some(lib) = &self.library {
            Arc::clone(lib)
        } else {
            let lib = Arc::new(NdiLibrary::load()?);
            self.library = Some(Arc::clone(&lib));
            lib
        };

        let session = ActiveNdiSession::create(library, request)?;
        let info = session.info.clone();
        log::info!(
            "NDI[{session_id}]: session active — {}x{} @ {}fps",
            info.width, info.height, info.fps
        );
        self.sessions.insert(session_id, session);
        Ok(info)
    }

    pub fn stop(&mut self, session_id: &str) {
        if let Some(existing) = self.sessions.remove(session_id) {
            log::info!("NDI[{session_id}]: stopping session");
            drop(existing);
        }
    }

    pub fn stop_all(&mut self) {
        for (id, _session) in self.sessions.drain() {
            log::info!("NDI[{id}]: stopping session");
        }
    }

    pub fn current_info(&self, session_id: &str) -> Option<NdiSessionInfo> {
        self.sessions.get(session_id).map(|s| s.info.clone())
    }

    pub fn send_frame_rgba(
        &mut self,
        session_id: &str,
        width: u32,
        height: u32,
        rgba_data: &[u8],
    ) -> Result<(), NdiError> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or(NdiError::SessionNotActive)?;
        session.send_frame_rgba(width, height, rgba_data)
    }
}

struct ActiveNdiSession {
    /// Shared NDI library (owns the send/destroy fn pointers). Keeps the library
    /// alive for this session and, collectively, until the last session ends.
    library: Arc<NdiLibrary>,
    _sender_name: CString,
    sender: NdiSendInstance,
    info: NdiSessionInfo,
    frame_count: u64,
    frame_buffer: Vec<u8>,
}

// SAFETY: ActiveNdiSession is only accessed behind a Mutex in app state.
// It contains opaque NDI pointers/function pointers and owned buffers.
unsafe impl Send for ActiveNdiSession {}
unsafe impl Sync for ActiveNdiSession {}

// SAFETY: NdiRuntime is stored behind Mutex and only mutated under lock.
unsafe impl Send for NdiRuntime {}
unsafe impl Sync for NdiRuntime {}

impl ActiveNdiSession {
    #[expect(clippy::needless_pass_by_value, reason = "request fields are destructured and moved into the session")]
    fn create(library: Arc<NdiLibrary>, request: NdiStartRequest) -> Result<Self, NdiError> {
        let source_name = request.source_name.trim().to_string();
        if source_name.is_empty() {
            return Err(NdiError::EmptySourceName);
        }

        let name = CString::new(source_name.clone()).map_err(|_| NdiError::EmptySourceName)?;
        let create = NdiSendCreate {
            p_ndi_name: name.as_ptr(),
            p_groups: std::ptr::null(),
            clock_video: false,
            clock_audio: false,
        };

        // SAFETY: send_create is a valid function pointer from the shared library. The
        // NdiSendCreate struct has valid pointers (name is a CString kept alive by the
        // _sender_name field). p_groups is null, which NDI accepts. On failure the shared
        // library is left loaded/initialized for the next attempt (destroyed once at shutdown).
        let create_ptr = std::ptr::from_ref(&create);
        let sender = unsafe { (library.send_create)(create_ptr) };
        if sender.is_null() {
            return Err(NdiError::SenderCreateFailed);
        }

        let (width, height) = request.resolution.dimensions();
        let fps = request.frame_rate.fps();

        Ok(Self {
            library,
            _sender_name: name,
            sender,
            info: NdiSessionInfo {
                source_name,
                resolution: request.resolution,
                frame_rate: request.frame_rate,
                alpha_mode: request.alpha_mode,
                width,
                height,
                fps,
            },
            frame_buffer: vec![0; (width * height * 4) as usize],
            frame_count: 0,
        })
    }

    fn send_frame_rgba(
        &mut self,
        width: u32,
        height: u32,
        rgba_data: &[u8],
    ) -> Result<(), NdiError> {
        validate_frame_dimensions(
            self.info.width,
            self.info.height,
            width,
            height,
            rgba_data.len(),
        )?;

        if self.frame_buffer.len() != rgba_data.len() {
            self.frame_buffer.resize(rgba_data.len(), 0);
        }

        rgba_to_bgra(&mut self.frame_buffer, rgba_data, self.info.alpha_mode);

        let (frame_rate_n, frame_rate_d) = ndi_frame_rate(self.info.fps);

        #[expect(
            clippy::cast_possible_wrap,
            reason = "NDI FFI requires i32 for dimensions/rates that are always positive and small"
        )]
        #[expect(
            clippy::cast_precision_loss,
            reason = "NDI FFI requires f32 aspect ratio; u32 dimensions fit in f32 without loss"
        )]
        let frame = NdiVideoFrameV2 {
            xres: width as i32,
            yres: height as i32,
            fourcc: u32::from_le_bytes(*b"BGRA"),
            frame_rate_n,
            frame_rate_d,
            picture_aspect_ratio: (width as f32) / (height as f32),
            frame_format_type: 1, // NDIlib_frame_format_type_progressive
            timecode: i64::MAX, // NDIlib_send_timecode_synthesize
            p_data: self.frame_buffer.as_mut_ptr(),
            line_stride_in_bytes: (width * 4) as i32,
            p_metadata: std::ptr::null(),
            timestamp: 0,
        };

        // SAFETY: sender is a valid NDI send instance. frame points to self.frame_buffer which
        // is correctly sized and will outlive this call.
        let sender = self.sender;
        let frame_ptr = std::ptr::from_ref(&frame);
        unsafe {
            (self.library.send_video)(sender, frame_ptr);
        }
        self.frame_count += 1;
        if self.frame_count == 1 {
            log::info!("NDI: first frame sent ({width}x{height}, {} bytes)", self.frame_buffer.len());
        } else if self.frame_count.is_multiple_of(300) {
            log::info!("NDI: {} frames sent", self.frame_count);
        }
        Ok(())
    }
}

impl Drop for ActiveNdiSession {
    fn drop(&mut self) {
        // Destroy ONLY this session's sender. The shared library (and its
        // NDIlib_destroy) stays alive for any other active session and is torn
        // down once, when the last Arc drops. This is the fix for F5: stopping
        // one of two concurrent outputs no longer deinitializes NDI globally.
        // SAFETY: sender was created by NDIlib_send_create and is non-null (validated
        // in create()). send_destroy is a valid fn pointer; the library is kept alive
        // by the `library` Arc until after this call.
        let sender = self.sender;
        unsafe {
            (self.library.send_destroy)(sender);
        }
    }
}

fn resolve_library_path() -> Result<PathBuf, NdiError> {
    let candidates: Vec<&str> = if cfg!(target_os = "macos") {
        vec!["sdk/ndi/macos/libndi.dylib"]
    } else if cfg!(target_os = "windows") {
        vec!["sdk/ndi/windows/Processing.NDI.Lib.x64.dll"]
    } else {
        vec![
            "sdk/ndi/linux/libndi.so",
            "sdk/ndi/linux/x86_64/libndi.so.6",
            "sdk/ndi/linux/libndi.so.6",
        ]
    };

    // Search the source tree (dev) first, then the directory alongside the
    // installed executable, which is where Tauri unpacks bundled resources
    // (production). CARGO_MANIFEST_DIR only exists on the build machine.
    let mut bases: Vec<PathBuf> = vec![Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            bases.push(dir.to_path_buf());
        }
    }

    for base in &bases {
        for candidate in &candidates {
            if candidate.is_empty() {
                continue;
            }
            let absolute = base.join(candidate);
            if absolute.exists() {
                return Ok(absolute);
            }
        }
    }

    Err(NdiError::LibraryNotFound(candidates.join(", ")))
}

/// NDI frame rate as a rational `(numerator, denominator)`.
///
/// Returns an *integer* rate (`fps/1`), matching the cadence the frontend
/// actually pushes frames at (`frame.ts` gates on `1000/fps`). We deliberately
/// do NOT use the NTSC-fractional `fps*1000 / 1001` convention: that would
/// declare 23.976/29.97/59.94 to receivers while the app produces exactly
/// 24/30/60, causing steady clock drift and periodic frame reconcile.
fn ndi_frame_rate(fps: u32) -> (i32, i32) {
    (i32::try_from(fps).unwrap_or(30), 1)
}

/// Validate an incoming frame against the session's negotiated dimensions.
///
/// Pure (no `self`) so the guard logic is unit-testable without a live NDI
/// session. Widths/heights are widened to `usize` before multiplying so the
/// expected-size math can never wrap.
fn validate_frame_dimensions(
    expected_width: u32,
    expected_height: u32,
    width: u32,
    height: u32,
    buffer_len: usize,
) -> Result<(), NdiError> {
    if width != expected_width || height != expected_height {
        return Err(NdiError::FrameDimensionsMismatch {
            expected_width,
            expected_height,
        });
    }
    let expected = (width as usize) * (height as usize) * 4;
    if buffer_len != expected {
        return Err(NdiError::InvalidFrameBufferSize { width, height });
    }
    Ok(())
}

/// Convert a packed RGBA buffer into BGRA in place, applying the alpha mode.
///
/// `dst` must be at least as long as `rgba` (callers size `frame_buffer` to
/// exactly `rgba.len()`). BGRA is the byte order NDI's `NDIlib_FourCC_type_BGRA`
/// expects. Pure and total so it can be parity-tested against the reference
/// swap.
fn rgba_to_bgra(dst: &mut [u8], rgba: &[u8], alpha: NdiAlphaMode) {
    debug_assert!(dst.len() >= rgba.len(), "dst must fit the converted frame");
    for (idx, px) in rgba.chunks_exact(4).enumerate() {
        let offset = idx * 4;
        dst[offset] = px[2];
        dst[offset + 1] = px[1];
        dst[offset + 2] = px[0];
        dst[offset + 3] = match alpha {
            NdiAlphaMode::NoneOpaque => 255,
            NdiAlphaMode::StraightAlpha => px[3],
        };
    }
}

fn load_symbol<'a, T>(
    library: &'a Library,
    symbol: &'static [u8],
    name: &'static str,
) -> Result<Symbol<'a, T>, NdiError> {
    // SAFETY: symbol name is a null-terminated byte string matching the NDI SDK's exported symbols
    unsafe { library.get::<T>(symbol) }.map_err(|e| NdiError::SymbolLoad {
        symbol: name,
        message: e.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_rate_is_integer_not_ntsc() {
        // Must match the integer fps the frontend pushes at, not the NTSC
        // fractional (fps*1000/1001) rate we used to declare.
        assert_eq!(ndi_frame_rate(24), (24, 1));
        assert_eq!(ndi_frame_rate(30), (30, 1));
        assert_eq!(ndi_frame_rate(60), (60, 1));
    }

    #[test]
    fn frame_rate_matches_frame_rate_enum() {
        for rate in [NdiFrameRate::Fps24, NdiFrameRate::Fps30, NdiFrameRate::Fps60] {
            let (n, d) = ndi_frame_rate(rate.fps());
            assert_eq!(d, 1);
            assert_eq!(n, i32::try_from(rate.fps()).unwrap());
        }
    }

    #[test]
    fn resolution_dimensions_are_stable() {
        assert_eq!(NdiResolution::R720p.dimensions(), (1280, 720));
        assert_eq!(NdiResolution::R1080p.dimensions(), (1920, 1080));
        assert_eq!(NdiResolution::R4k.dimensions(), (3840, 2160));
    }

    // Reference implementation — the original inline loop. `rgba_to_bgra` must
    // stay byte-identical to this (a parity test, per CLAUDE.md testing rules).
    fn reference_rgba_to_bgra(rgba: &[u8], alpha: NdiAlphaMode) -> Vec<u8> {
        let mut dst = vec![0u8; rgba.len()];
        for (idx, px) in rgba.chunks_exact(4).enumerate() {
            let offset = idx * 4;
            dst[offset] = px[2];
            dst[offset + 1] = px[1];
            dst[offset + 2] = px[0];
            dst[offset + 3] = match alpha {
                NdiAlphaMode::NoneOpaque => 255,
                NdiAlphaMode::StraightAlpha => px[3],
            };
        }
        dst
    }

    fn sample_rgba() -> Vec<u8> {
        // Two pixels with distinct channels and non-trivial alpha.
        vec![10, 20, 30, 40, 200, 150, 100, 128]
    }

    #[test]
    fn rgba_to_bgra_swaps_channels() {
        let rgba = sample_rgba();
        let mut dst = vec![0u8; rgba.len()];
        rgba_to_bgra(&mut dst, &rgba, NdiAlphaMode::StraightAlpha);
        // R,G,B,A -> B,G,R,A
        assert_eq!(&dst[0..4], &[30, 20, 10, 40]);
        assert_eq!(&dst[4..8], &[100, 150, 200, 128]);
    }

    #[test]
    fn rgba_to_bgra_opaque_forces_full_alpha() {
        let rgba = sample_rgba();
        let mut dst = vec![0u8; rgba.len()];
        rgba_to_bgra(&mut dst, &rgba, NdiAlphaMode::NoneOpaque);
        assert_eq!(dst[3], 255);
        assert_eq!(dst[7], 255);
    }

    #[test]
    fn rgba_to_bgra_straight_passes_alpha_through() {
        let rgba = sample_rgba();
        let mut dst = vec![0u8; rgba.len()];
        rgba_to_bgra(&mut dst, &rgba, NdiAlphaMode::StraightAlpha);
        assert_eq!(dst[3], 40);
        assert_eq!(dst[7], 128);
    }

    #[test]
    fn rgba_to_bgra_matches_reference_for_all_modes() {
        let rgba = sample_rgba();
        for alpha in [NdiAlphaMode::NoneOpaque, NdiAlphaMode::StraightAlpha] {
            let mut dst = vec![0u8; rgba.len()];
            rgba_to_bgra(&mut dst, &rgba, alpha);
            assert_eq!(dst, reference_rgba_to_bgra(&rgba, alpha));
        }
    }

    #[test]
    fn validate_accepts_matching_frame() {
        // 1280x720x4 = 3_686_400 bytes.
        assert!(validate_frame_dimensions(1280, 720, 1280, 720, 1280 * 720 * 4).is_ok());
    }

    #[test]
    fn validate_rejects_dimension_mismatch() {
        let err = validate_frame_dimensions(1920, 1080, 1280, 720, 1280 * 720 * 4);
        assert!(matches!(
            err,
            Err(NdiError::FrameDimensionsMismatch {
                expected_width: 1920,
                expected_height: 1080,
            })
        ));
    }

    #[test]
    fn validate_rejects_wrong_buffer_size() {
        let err = validate_frame_dimensions(1280, 720, 1280, 720, 1280 * 720 * 4 - 1);
        assert!(matches!(
            err,
            Err(NdiError::InvalidFrameBufferSize {
                width: 1280,
                height: 720,
            })
        ));
    }

    #[test]
    fn validate_size_math_does_not_overflow_at_4k() {
        // 3840*2160*4 = 33_177_600; the widened usize math must not wrap.
        assert!(validate_frame_dimensions(3840, 2160, 3840, 2160, 3840 * 2160 * 4).is_ok());
    }
}
