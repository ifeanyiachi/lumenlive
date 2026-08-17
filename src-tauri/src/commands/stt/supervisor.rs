//! STT engine supervision for one transcription session: runs the operator's
//! primary provider and, when the cloud link drops mid-service, fails over to
//! on-device Moonshine and probes for the network's return so it can fail back.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use lumenlive_stt::{SttProvider, TranscriptEvent};

/// Lightweight connectivity probe: can we open a TCP connection to the Deepgram
/// API host? Used to detect when the network returns so the supervisor can fail
/// back from on-device Moonshine to the cloud provider. When offline, DNS
/// resolution / the connect fails fast; success means the link is back. Runs on
/// a blocking thread (DNS + connect block) and never touches the STT quota.
async fn deepgram_reachable() -> bool {
    tokio::task::spawn_blocking(|| {
        use std::net::ToSocketAddrs;
        let Ok(mut addrs) = ("api.deepgram.com", 443u16).to_socket_addrs() else {
            return false;
        };
        let Some(addr) = addrs.next() else { return false };
        std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3)).is_ok()
    })
    .await
    .unwrap_or(false)
}

/// Supervise the STT engines for one transcription session.
///
/// Runs the operator-selected `primary` provider. If it returns an error while
/// `active` is still set — i.e. the cloud provider lost the network, not a user
/// stop — it fails over to the on-device Moonshine `fallback` (when present) and
/// starts a background probe. Once the probe sees connectivity return, it stops
/// Moonshine and loops back to the cloud provider. The on-device dwell backs off
/// when the cloud link keeps failing right after a failback, so a flaky
/// connection doesn't ping-pong. Emits `stt_failover` / `stt_failback` so the UI
/// can show which engine is live. Both providers re-arm on `start()`, so the
/// same instances are reused across cycles (no per-cycle model reload beyond the
/// first Moonshine load).
pub(super) async fn run_stt_supervisor(
    primary: Box<dyn SttProvider>,
    fallback: Option<std::sync::Arc<dyn SttProvider>>,
    audio_rx: crossbeam_channel::Receiver<Vec<i16>>,
    event_tx: tokio::sync::mpsc::Sender<TranscriptEvent>,
    active: Arc<AtomicBool>,
    app: AppHandle,
    primary_name: String,
) {
    // Longest we'll stay on-device between probes on a flaky link, and how long
    // between probes for the network's return.
    const MAX_DWELL: Duration = Duration::from_secs(60);
    const PROBE_INTERVAL: Duration = Duration::from_secs(5);

    // Minimum time on-device before we start probing for the network. Grows when
    // the cloud link proves flaky (fails again right after a failback).
    let mut on_device_dwell = Duration::from_secs(5);

    loop {
        if !active.load(Ordering::SeqCst) {
            break;
        }

        // ── Cloud/primary phase ──
        let cloud_started = Instant::now();
        let result = primary.start(audio_rx.clone(), event_tx.clone()).await;

        // A clean return (Ok) or a user stop ends the session.
        if !active.load(Ordering::SeqCst) || result.is_ok() {
            break;
        }
        log::error!("[STT-{primary_name}] provider failed: {:?}", result.err());

        let Some(fallback) = fallback.clone() else {
            // No on-device engine to fall back to — surface a real error and stop.
            let _ = app.emit(
                "stt_error",
                "Connection lost and no on-device fallback is available.",
            );
            break;
        };

        // Flaky-link back-off: if the cloud phase died almost immediately after a
        // failback, lengthen the on-device dwell; otherwise reset it.
        if cloud_started.elapsed() < Duration::from_secs(8) {
            on_device_dwell = (on_device_dwell * 2).min(MAX_DWELL);
        } else {
            on_device_dwell = Duration::from_secs(5);
        }

        log::warn!(
            "[STT] {primary_name} unreachable — failing over to on-device Moonshine (dwell {on_device_dwell:?})"
        );
        let _ = app.emit(
            "stt_failover",
            "Network lost — switched to on-device transcription",
        );

        // ── On-device phase: run Moonshine and probe for the network in parallel ──
        let net_back = Arc::new(AtomicBool::new(false));

        let moon = {
            let fallback = fallback.clone();
            let audio_rx = audio_rx.clone();
            let event_tx = event_tx.clone();
            tauri::async_runtime::spawn(async move {
                let _ = fallback.start(audio_rx, event_tx).await;
            })
        };

        let probe = {
            let net_back = net_back.clone();
            let active = active.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(on_device_dwell).await;
                while active.load(Ordering::SeqCst) && !net_back.load(Ordering::SeqCst) {
                    if deepgram_reachable().await {
                        net_back.store(true, Ordering::SeqCst);
                        break;
                    }
                    tokio::time::sleep(PROBE_INTERVAL).await;
                }
            })
        };

        // Wait for the network to return or the user to stop, then tear down
        // Moonshine so the next cloud phase (or shutdown) can proceed.
        loop {
            if !active.load(Ordering::SeqCst) || net_back.load(Ordering::SeqCst) {
                fallback.stop();
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        probe.abort();
        let _ = moon.await;

        if !active.load(Ordering::SeqCst) {
            break;
        }

        log::info!("[STT] network restored — returning to {primary_name}");
        let _ = app.emit(
            "stt_failback",
            "Network restored — switched back to cloud transcription",
        );
    }

    active.store(false, Ordering::SeqCst);
    log::info!("[STT-{primary_name}] supervisor exited");
}
