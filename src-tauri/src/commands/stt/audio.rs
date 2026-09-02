//! Audio capture + fan-out thread. cpal's `Stream` (inside `AudioCapture`) is
//! `!Send`, so it must be created and dropped on the same dedicated thread. That
//! thread starts capture, computes level meters, forwards samples to STT, and
//! rebuilds the capture across device loss/recovery.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use lumenlive_audio::{AudioConfig, AudioFrame};

use crate::events::{
    AudioLevelPayload, TranscriptionUsagePayload, EVENT_AUDIO_LEVEL, EVENT_AUDIO_SOURCE_LOST,
    EVENT_AUDIO_SOURCE_RECOVERED, EVENT_TRANSCRIPTION_USAGE,
};

/// Sample rate the STT pipeline runs at (see `AudioConfig` below); usage seconds
/// = samples streamed / this. Kept in sync with the `sample_rate: 16_000` config.
const STT_SAMPLE_RATE: f64 = 16_000.0;
/// How often to emit a usage delta while a session streams. One minute keeps the
/// metering endpoint quiet while still catching an allowance running out promptly.
const USAGE_EMIT_INTERVAL: Duration = Duration::from_secs(60);

/// Spawn the audio-capture + fan-out thread. It:
///   a) starts the cpal capture (rebuilding it across device loss/recovery)
///   b) reads `AudioFrame`s
///   c) computes levels → emits `audio_level` events
///   d) forwards samples to the STT provider via `audio_send_tx`
///
/// The thread runs until `stt_active` is cleared by `stop_transcription`. On a
/// spawn failure both active flags are reset so the app doesn't wedge in a
/// half-started state.
#[expect(
    clippy::too_many_lines,
    reason = "one cohesive capture/rebuild loop; the !Send cpal stream must live \
              and die on this thread, so the rebuild-on-loss flow can't factor \
              cleanly across a helper boundary"
)]
pub(super) fn spawn_audio_fanout(
    app: &AppHandle,
    device_id: Option<String>,
    gain: Option<f32>,
    stt_active: &Arc<AtomicBool>,
    audio_active: &Arc<AtomicBool>,
    audio_send_tx: crossbeam_channel::Sender<Vec<i16>>,
) -> Result<(), String> {
    let gain_val = gain.unwrap_or(1.0).clamp(0.0, 2.0);
    let fan_active = stt_active.clone();
    let fan_app = app.clone();

    std::thread::Builder::new()
        .name("audio-fanout".into())
        .spawn(move || {
            // Watchdog flag — set by cpal's stream-error callback when the OS
            // device vanishes. The outer loop polls this (and frame silence)
            // to detect loss and rebuild the capture once the device returns.
            let device_lost = Arc::new(AtomicBool::new(false));
            let mut frame_count: u64 = 0;
            let mut announced_lost = false;

            // Usage metering (portalplan D2-06). Count audio samples actually
            // handed to the STT provider this session — not wall-clock — so the
            // platform can meter free/trial minutes accurately. Declared outside
            // the rebuild loop so the running total survives device loss/recovery
            // and provider reconnects. `reported_samples` tracks what's already
            // been emitted so each `transcription_usage` carries a delta.
            let mut usage_samples: u64 = 0;
            let mut reported_samples: u64 = 0;
            let mut last_usage_emit = Instant::now();

            // Outer loop: rebuild `AudioCapture` whenever the device is lost
            // and reappears. Exits only when `fan_active` is cleared by
            // `stop_transcription`.
            'outer: loop {
                if !fan_active.load(Ordering::SeqCst) {
                    break 'outer;
                }

                let config = AudioConfig {
                    device_id: device_id.clone(),
                    sample_rate: 16_000,
                    gain: gain_val,
                };

                let (audio_tx, audio_rx) = crossbeam_channel::bounded::<AudioFrame>(64);
                device_lost.store(false, Ordering::SeqCst);

                let capture = match lumenlive_audio::capture::start(
                    config,
                    audio_tx,
                    device_lost.clone(),
                ) {
                    Ok(c) => {
                        if announced_lost {
                            log::info!("[AUDIO] Source recovered — capture rebuilt");
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_RECOVERED, ());
                            announced_lost = false;
                        }
                        c
                    }
                    Err(e) => {
                        if !announced_lost {
                            log::warn!(
                                "[AUDIO] Source unavailable: {e} — waiting for reconnect"
                            );
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_LOST, ());
                            announced_lost = true;
                            // Drop level meter to zero so UI reflects the gap.
                            let _ = fan_app.emit(
                                EVENT_AUDIO_LEVEL,
                                AudioLevelPayload { rms: 0.0, peak: 0.0 },
                            );
                        }
                        std::thread::sleep(Duration::from_millis(750));
                        continue 'outer;
                    }
                };

                log::info!("Audio capture started on fanout thread");

                let mut last_frame_at = Instant::now();

                // Inner loop: pump frames until loss is detected or stop is requested.
                loop {
                    if !fan_active.load(Ordering::SeqCst) {
                        capture.stop();
                        break 'outer;
                    }

                    // Loss signal #1: cpal's err_fn fired.
                    // Loss signal #2: no frames for >2s (some platforms silently
                    // stop delivering rather than calling err_fn).
                    if device_lost.load(Ordering::SeqCst)
                        || last_frame_at.elapsed() > Duration::from_secs(2)
                    {
                        log::warn!(
                            "[AUDIO] Source lost (err_flag={}, silent_for={:?}) — dropping capture",
                            device_lost.load(Ordering::SeqCst),
                            last_frame_at.elapsed()
                        );
                        if !announced_lost {
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_LOST, ());
                            let _ = fan_app.emit(
                                EVENT_AUDIO_LEVEL,
                                AudioLevelPayload { rms: 0.0, peak: 0.0 },
                            );
                            announced_lost = true;
                        }
                        break; // drop `capture`, outer loop rebuilds
                    }

                    match audio_rx.recv_timeout(Duration::from_millis(100)) {
                        Ok(frame) => {
                            last_frame_at = Instant::now();
                            frame_count += 1;

                            // (a) Compute audio levels at ~15 Hz
                            //     At 16 kHz with ~1024-sample frames, every 4th frame is ~15 Hz.
                            if frame_count % 4 == 0 {
                                let level = lumenlive_audio::meter::compute_level(&frame.samples);
                                let _ = fan_app.emit(
                                    EVENT_AUDIO_LEVEL,
                                    AudioLevelPayload {
                                        rms: level.rms,
                                        peak: level.peak,
                                    },
                                );
                            }

                            // (b) Forward all audio to STT provider. Count only
                            //     samples the provider actually accepts — audio
                            //     dropped while it reconnects isn't submitted to
                            //     the STT service, so it isn't metered.
                            let sample_count = frame.samples.len() as u64;
                            if audio_send_tx.try_send(frame.samples).is_ok() {
                                usage_samples += sample_count;
                            }

                            // (c) Emit a usage delta on the interval. Runs on the
                            //     frame path so it only fires while audio flows.
                            if last_usage_emit.elapsed() >= USAGE_EMIT_INTERVAL {
                                let delta = usage_samples - reported_samples;
                                if delta > 0 {
                                    let _ = fan_app.emit(
                                        EVENT_TRANSCRIPTION_USAGE,
                                        TranscriptionUsagePayload {
                                            seconds: delta as f64 / STT_SAMPLE_RATE,
                                        },
                                    );
                                    reported_samples = usage_samples;
                                }
                                last_usage_emit = Instant::now();
                            }
                        }
                        Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                        Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                            // Capture's sender was dropped — fall through to rebuild.
                            break;
                        }
                    }
                }

                // Dropping `capture` stops the cpal stream.
                capture.stop();
            }

            // Final usage flush — report any audio streamed since the last emit
            // so the tail of a session (and short sessions under the interval)
            // is still metered.
            let delta = usage_samples - reported_samples;
            if delta > 0 {
                let _ = fan_app.emit(
                    EVENT_TRANSCRIPTION_USAGE,
                    TranscriptionUsagePayload {
                        seconds: delta as f64 / STT_SAMPLE_RATE,
                    },
                );
            }

            log::info!("Audio capture stopped on fanout thread");
        })
        .map_err(|e| {
            stt_active.store(false, Ordering::SeqCst);
            audio_active.store(false, Ordering::SeqCst);
            format!("Failed to spawn audio fanout thread: {e}")
        })?;

    Ok(())
}
