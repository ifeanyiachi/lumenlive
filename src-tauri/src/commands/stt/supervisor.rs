//! STT engine supervision for one transcription session: runs the operator's
//! primary provider and, when the cloud link drops mid-service, fails over to
//! on-device Moonshine and probes for the network's return so it can fail back.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use lumenlive_stt::{SttProvider, TranscriptEvent};

/// Lightweight connectivity probe: can we open a TCP connection to the Deepgram
/// API host? Used both to detect the network *dropping* mid-service (so the
/// supervisor can fail over promptly) and *returning* (so it can fail back).
/// When offline, DNS resolution / the connect fails within the timeout; success
/// means the link is up. Runs on a blocking thread (DNS + connect block) and
/// never touches the STT quota.
///
/// The 1s connect timeout keeps an offline probe fast enough that the whole
/// detect-and-switch cycle stays inside the few-second failover budget.
async fn deepgram_reachable() -> bool {
    tokio::task::spawn_blocking(|| {
        use std::net::ToSocketAddrs;
        let Ok(mut addrs) = ("api.deepgram.com", 443u16).to_socket_addrs() else {
            return false;
        };
        let Some(addr) = addrs.next() else { return false };
        std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(1)).is_ok()
    })
    .await
    .unwrap_or(false)
}

/// Spawn the cloud-phase connectivity watchdog. It probes the network every
/// `interval`; the first time the link is unreachable it flags `net_lost` and
/// stops `primary`, so the supervisor's `start()` returns and it fails over —
/// proactively, without waiting for the socket to notice the drop. Returns the
/// handle so the caller can abort it once the cloud phase ends.
fn spawn_connectivity_watchdog(
    primary: Arc<dyn SttProvider>,
    active: Arc<AtomicBool>,
    net_lost: Arc<AtomicBool>,
    interval: Duration,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(interval).await;
            if !active.load(Ordering::SeqCst) {
                break;
            }
            if !deepgram_reachable().await {
                net_lost.store(true, Ordering::SeqCst);
                primary.stop();
                break;
            }
        }
    })
}

/// Supervise the STT engines for one transcription session.
///
/// Runs the operator-selected `primary` provider. While the cloud provider is
/// live, a connectivity watchdog probes the network in parallel so a drop is
/// detected proactively — the moment it goes offline the watchdog stops the
/// primary and we fail over, rather than waiting for the socket to notice. A
/// primary error while `active` is still set (network lost, not a user stop)
/// triggers the same failover. Either way it switches to the on-device Moonshine
/// `fallback` (when present) and starts a background probe; once that probe sees
/// connectivity return, it stops Moonshine and loops back to the cloud provider.
/// The on-device dwell backs off when the cloud link keeps failing right after a
/// failback, so a flaky connection doesn't ping-pong. Emits `stt_failover` /
/// `stt_failback` so the UI can show which engine is live. Both providers re-arm
/// on `start()`, so the same instances are reused across cycles (no per-cycle
/// model reload beyond the first Moonshine load).
#[expect(
    clippy::too_many_lines,
    reason = "one cohesive cloud↔on-device supervision loop; extracting the phases \
              would obscure the failover/failback control flow it exists to express"
)]
pub(super) async fn run_stt_supervisor(
    primary: std::sync::Arc<dyn SttProvider>,
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
    // How often the watchdog probes connectivity while the cloud provider is
    // live. Combined with the 1s probe timeout, a drop is caught within ~2.5s.
    const WATCH_INTERVAL: Duration = Duration::from_millis(1500);

    // Minimum time on-device before we start probing for the network. Grows when
    // the cloud link proves flaky (fails again right after a failback).
    let mut on_device_dwell = Duration::from_secs(5);

    loop {
        if !active.load(Ordering::SeqCst) {
            break;
        }

        // ── Cloud/primary phase ──
        //
        // Run the primary provider and, in parallel, a connectivity watchdog that
        // proactively detects the network dropping (rather than waiting for the
        // socket to error out). The moment a probe sees the link is gone it stops
        // the primary so `start()` returns and we fail over. The watchdog only
        // runs when there is a fallback to switch to.
        let cloud_started = Instant::now();
        let net_lost = Arc::new(AtomicBool::new(false));

        let watchdog = fallback.as_ref().map(|_| {
            spawn_connectivity_watchdog(
                primary.clone(),
                active.clone(),
                net_lost.clone(),
                WATCH_INTERVAL,
            )
        });

        let result = primary.start(audio_rx.clone(), event_tx.clone()).await;
        if let Some(w) = watchdog {
            w.abort();
        }
        let net_lost = net_lost.load(Ordering::SeqCst);

        // A user stop ends the session. So does a clean provider return with the
        // network still up. But when the watchdog tripped, `stop()` is what made
        // `start()` return Ok — so treat that as a drop and fail over.
        if !active.load(Ordering::SeqCst) {
            break;
        }
        if result.is_ok() && !net_lost {
            break;
        }
        if net_lost {
            log::warn!("[STT] {primary_name} — watchdog detected network offline");
        } else {
            log::error!("[STT-{primary_name}] provider failed: {:?}", result.err());
        }

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
            let moon_app = app.clone();
            tauri::async_runtime::spawn(async move {
                // `stt_failover` was emitted optimistically above, so if the
                // on-device engine can't actually start (model files missing, or
                // the native recognizer fails to load) we must surface that —
                // otherwise the UI shows a false "on-device active" badge over a
                // silent dead session. Emitting `stt_error` both toasts the real
                // reason and clears the on-device indicator. (A recognizer that
                // loads then fails per-utterance already reports via
                // `TranscriptEvent::Error`; this covers the `start()` error that
                // was previously discarded.)
                if let Err(e) = fallback.start(audio_rx, event_tx).await {
                    log::error!("[STT] on-device Moonshine failed to start: {e}");
                    let _ = moon_app.emit(
                        "stt_error",
                        format!("On-device transcription unavailable: {e}"),
                    );
                }
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
