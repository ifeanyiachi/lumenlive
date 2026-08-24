//! Watch for a broadcast display monitor being unplugged and plugged back in
//! mid-service.
//!
//! A projector / HDMI output window is borderless, non-closable and hidden from
//! the taskbar and alt-tab (see [`crate::commands::broadcast::open_broadcast_window`]).
//! When the operator unplugs that display, Windows doesn't destroy the window — it
//! yanks it onto the remaining (operator) screen, where it sits fullscreen and
//! undismissable ("the broadcast output stays on my PC"). Tauri surfaces no
//! monitor-hotplug event, so we poll the connected monitors.
//!
//! The output stays **on** across an unplug: when a tracked output's monitor is
//! gone we merely *hide* its window (keeping the webview alive and current) and
//! tell the frontend to show a "reconnecting" state. When the same display
//! returns — matched by physical origin, or by monitor name if it comes back at a
//! new origin — we re-show the window on it and tell the frontend to re-push
//! content. So an accidental cable knock never drops the projector permanently;
//! it resumes the instant the cable is back, with no operator action.
//!
//! Polling (rather than an OS hook) is deliberate: monitor enumeration is cheap,
//! unplugging a display is rare, and one poll path works identically across every
//! platform Tauri targets.

use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::commands::broadcast::{
    pause_display_window, resume_display_window, OutputDisplayTarget, OutputMonitors,
};
use crate::events::{
    OutputDisplayConnectedPayload, OutputDisplayDisconnectedPayload,
    EVENT_OUTPUT_DISPLAY_CONNECTED, EVENT_OUTPUT_DISPLAY_DISCONNECTED,
};

/// How often to re-check the connected monitors. Monitor enumeration is cheap and
/// unplugging a display is rare, so a ~1s cadence clears the stranded window
/// within a second of the unplug without any measurable idle cost.
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Spawn the background poller for the app's lifetime.
pub fn spawn(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(POLL_INTERVAL).await;
            check_once(&app);
        }
    });
}

/// A connected monitor described as plain data: `(x, y, w, h, name)`. Decoupled
/// from `tauri::Monitor` so the target-selection logic below is pure and testable.
type MonitorDesc = (i32, i32, u32, u32, Option<String>);

/// One poll: for each tracked output, hide its window if its monitor just went
/// away, or re-show it if its monitor just came back.
fn check_once(app: &tauri::AppHandle) {
    // Snapshot the tracked outputs so the registry lock isn't held across the
    // monitor query or the pause/resume calls (which re-lock the same registry).
    let tracked: Vec<(String, OutputDisplayTarget)> = match app.try_state::<OutputMonitors>() {
        Some(reg) => match reg.0.lock() {
            Ok(map) => map.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            Err(_) => return,
        },
        None => return,
    };
    if tracked.is_empty() {
        return;
    }

    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(e) => {
            log::warn!("display-watch: could not enumerate monitors: {e}");
            return;
        }
    };
    let descs: Vec<MonitorDesc> = monitors
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width, s.height, m.name().cloned())
        })
        .collect();

    for (output_id, target) in tracked {
        let matched = select_target_index(target.origin, target.name.as_deref(), &descs);
        match (matched, target.awaiting_reconnect) {
            // Monitor gone and not yet flagged: hide the window, hold the entry,
            // and tell the control UI we're waiting for the display to return.
            (None, false) => {
                let ndi_active = pause_display_window(app, &output_id);
                set_awaiting(app, &output_id, true);
                let _ = app.emit(
                    EVENT_OUTPUT_DISPLAY_DISCONNECTED,
                    OutputDisplayDisconnectedPayload {
                        output_id: output_id.clone(),
                        ndi_active,
                    },
                );
                log::info!(
                    "display-watch: output '{output_id}' display disconnected; hidden, awaiting reconnect (ndi_active={ndi_active})"
                );
            }
            // Monitor back after a disconnect: re-show on its current geometry and
            // refresh the tracked origin/name for the next cycle.
            (Some(idx), true) => {
                let (mx, my, mw, mh, name) = descs[idx].clone();
                resume_display_window(app, &output_id, (mx, my), (mw, mh));
                update_target(app, &output_id, (mx, my), name);
                let _ = app.emit(
                    EVENT_OUTPUT_DISPLAY_CONNECTED,
                    OutputDisplayConnectedPayload {
                        output_id: output_id.clone(),
                    },
                );
                log::info!("display-watch: output '{output_id}' display reconnected; restored");
            }
            // Steady state (present & connected, or gone & already flagged): nothing.
            _ => {}
        }
    }
}

/// Flip a tracked output's `awaiting_reconnect` flag. No-op if the entry is gone
/// (the operator closed the output between the snapshot and now).
fn set_awaiting(app: &tauri::AppHandle, output_id: &str, awaiting: bool) {
    if let Some(reg) = app.try_state::<OutputMonitors>() {
        if let Ok(mut map) = reg.0.lock() {
            if let Some(t) = map.get_mut(output_id) {
                t.awaiting_reconnect = awaiting;
            }
        }
    }
}

/// Refresh a reconnected output's tracked origin/name (the display may have
/// returned at a new position) and clear the awaiting flag.
fn update_target(app: &tauri::AppHandle, output_id: &str, origin: (i32, i32), name: Option<String>) {
    if let Some(reg) = app.try_state::<OutputMonitors>() {
        if let Ok(mut map) = reg.0.lock() {
            if let Some(t) = map.get_mut(output_id) {
                t.origin = origin;
                t.name = name;
                t.awaiting_reconnect = false;
            }
        }
    }
}

/// Pure target selection: which connected monitor is this output's display?
///
/// Prefers the monitor still covering the recorded `origin` (the same physical
/// slot — handles "still connected" and "replugged at the same origin"); failing
/// that, the monitor whose name matches (a replug that landed at a new origin).
/// Returns the monitor's index in `monitors`, or `None` when the display is gone.
fn select_target_index(
    origin: (i32, i32),
    name: Option<&str>,
    monitors: &[MonitorDesc],
) -> Option<usize> {
    if let Some(i) = monitors
        .iter()
        .position(|&(x, y, w, h, _)| point_in_rect(origin, (x, y, w, h)))
    {
        return Some(i);
    }
    if let Some(name) = name {
        if let Some(i) = monitors
            .iter()
            .position(|(_, _, _, _, n)| n.as_deref() == Some(name))
        {
            return Some(i);
        }
    }
    None
}

/// Pure containment test: does point `(px, py)` fall inside rect `(x, y, w, h)`?
///
/// A monitor's own top-left origin is `(x, y)`, which satisfies `px >= x` and
/// `px < x + w`, so a still-connected monitor always contains its recorded origin;
/// only a removed (or drastically rearranged) monitor leaves the origin uncovered.
fn point_in_rect(point: (i32, i32), rect: (i32, i32, u32, u32)) -> bool {
    // Widen to i64 so a monitor's width/height (u32) never wraps when added to a
    // signed origin, and no `as` cast is needed.
    let px = i64::from(point.0);
    let py = i64::from(point.1);
    let (x, y, w, h) = rect;
    let x = i64::from(x);
    let y = i64::from(y);
    px >= x && px < x + i64::from(w) && py >= y && py < y + i64::from(h)
}

#[cfg(test)]
mod tests {
    use super::{point_in_rect, select_target_index, MonitorDesc};

    // Two side-by-side 1080p monitors: operator at origin, external to the right.
    const OPERATOR: (i32, i32, u32, u32) = (0, 0, 1920, 1080);
    const EXTERNAL: (i32, i32, u32, u32) = (1920, 0, 1920, 1080);

    fn desc(x: i32, y: i32, w: u32, h: u32, name: &str) -> MonitorDesc {
        (x, y, w, h, Some(name.to_string()))
    }

    #[test]
    fn selects_monitor_covering_the_recorded_origin() {
        let monitors = [
            desc(0, 0, 1920, 1080, "operator"),
            desc(1920, 0, 1920, 1080, "projector"),
        ];
        // Still connected at the same origin → picks the covering monitor.
        assert_eq!(select_target_index((1920, 0), Some("projector"), &monitors), Some(1));
        assert_eq!(select_target_index((0, 0), Some("operator"), &monitors), Some(0));
    }

    #[test]
    fn reattaches_by_name_when_origin_moved() {
        // Projector came back to the LEFT of the operator (new origin -1920,0), so
        // origin containment misses but the name still identifies it.
        let monitors = [
            desc(-1920, 0, 1920, 1080, "projector"),
            desc(0, 0, 1920, 1080, "operator"),
        ];
        assert_eq!(select_target_index((1920, 0), Some("projector"), &monitors), Some(0));
    }

    #[test]
    fn returns_none_when_display_absent() {
        // Only the operator screen remains and no name matches → disconnected.
        let monitors = [desc(0, 0, 1920, 1080, "operator")];
        assert_eq!(select_target_index((1920, 0), Some("projector"), &monitors), None);
    }

    #[test]
    fn origin_containment_wins_over_a_stale_name_match() {
        // A different display now occupies the projector's old slot; we reattach to
        // whatever physically sits there rather than chasing the old name elsewhere.
        let monitors = [
            desc(1920, 0, 1920, 1080, "replacement"),
            desc(3840, 0, 1920, 1080, "projector"),
        ];
        assert_eq!(select_target_index((1920, 0), Some("projector"), &monitors), Some(0));
    }

    #[test]
    fn origin_of_connected_monitor_is_contained() {
        // Each monitor covers its own recorded origin.
        assert!(point_in_rect((0, 0), OPERATOR), "operator origin");
        assert!(point_in_rect((1920, 0), EXTERNAL), "external origin");
    }

    #[test]
    fn origin_of_unplugged_monitor_is_not_contained() {
        // External unplugged: the external window's recorded origin (1920,0) is no
        // longer covered by the remaining operator screen → disconnected.
        assert!(!point_in_rect((1920, 0), OPERATOR));
        assert!(point_in_rect((0, 0), OPERATOR), "operator still there");
    }

    #[test]
    fn empty_monitor_set_selects_nothing() {
        assert_eq!(select_target_index((0, 0), Some("operator"), &[]), None);
    }

    #[test]
    fn point_on_far_edge_is_excluded() {
        // The right/bottom edges are exclusive so adjacent monitors don't both
        // claim the shared boundary pixel.
        assert!(!point_in_rect((1920, 0), OPERATOR));
        assert!(!point_in_rect((0, 1080), OPERATOR));
    }
}
