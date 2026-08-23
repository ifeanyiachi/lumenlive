//! Watch for a broadcast display monitor being disconnected mid-service.
//!
//! A projector / HDMI output window is borderless, non-closable and hidden from
//! the taskbar and alt-tab (see [`crate::commands::broadcast::open_broadcast_window`]).
//! When the operator unplugs that display, Windows doesn't destroy the window — it
//! yanks it onto the remaining (operator) screen, where it sits fullscreen and
//! undismissable ("the broadcast output stays on my PC"). Tauri surfaces no
//! monitor-hotplug event, so we poll the connected monitors and, when a live
//! output's monitor is gone, tear that output down and tell the frontend to switch
//! its control off.
//!
//! Polling (rather than an OS hook) is deliberate: monitor enumeration is cheap,
//! unplugging a display is rare, and one poll path works identically across every
//! platform Tauri targets.

use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::commands::broadcast::{teardown_display_window, OutputMonitors};
use crate::events::{
    OutputDisplayDisconnectedPayload, EVENT_OUTPUT_DISPLAY_DISCONNECTED,
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

/// One poll: tear down every tracked output whose monitor origin is no longer
/// inside a connected display.
fn check_once(app: &tauri::AppHandle) {
    // Snapshot the tracked outputs so the registry lock isn't held across the
    // monitor query or the teardown (which re-locks the same registry).
    let tracked: Vec<(String, (i32, i32))> = match app.try_state::<OutputMonitors>() {
        Some(reg) => match reg.0.lock() {
            Ok(map) => map.iter().map(|(k, v)| (k.clone(), *v)).collect(),
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
    let rects: Vec<(i32, i32, u32, u32)> = monitors
        .iter()
        .map(|m| {
            let p = m.position();
            let s = m.size();
            (p.x, p.y, s.width, s.height)
        })
        .collect();

    for (output_id, origin) in tracked {
        if point_in_any_rect(origin, &rects) {
            continue;
        }
        // The monitor this output was opened on is gone — the display was
        // disconnected. Tear the output window down, then tell the control UI.
        let ndi_active = teardown_display_window(app, &output_id);
        let _ = app.emit(
            EVENT_OUTPUT_DISPLAY_DISCONNECTED,
            OutputDisplayDisconnectedPayload {
                output_id: output_id.clone(),
                ndi_active,
            },
        );
        log::info!(
            "display-watch: output '{output_id}' display disconnected; torn down (ndi_active={ndi_active})"
        );
    }
}

/// Pure containment test: does point `(px, py)` fall inside any rect `(x, y, w, h)`?
///
/// A monitor's own top-left origin is `(x, y)`, which satisfies `px >= x` and
/// `px < x + w`, so a still-connected monitor always contains its recorded origin;
/// only a removed (or drastically rearranged) monitor leaves the origin uncovered.
fn point_in_any_rect(point: (i32, i32), rects: &[(i32, i32, u32, u32)]) -> bool {
    // Widen to i64 so a monitor's width/height (u32) never wraps when added to a
    // signed origin, and no `as` cast is needed.
    let px = i64::from(point.0);
    let py = i64::from(point.1);
    rects.iter().any(|&(x, y, w, h)| {
        let x = i64::from(x);
        let y = i64::from(y);
        px >= x && px < x + i64::from(w) && py >= y && py < y + i64::from(h)
    })
}

#[cfg(test)]
mod tests {
    use super::point_in_any_rect;

    // Two side-by-side 1080p monitors: operator at origin, external to the right.
    const OPERATOR: (i32, i32, u32, u32) = (0, 0, 1920, 1080);
    const EXTERNAL: (i32, i32, u32, u32) = (1920, 0, 1920, 1080);

    #[test]
    fn origin_of_connected_monitor_is_contained() {
        let rects = [OPERATOR, EXTERNAL];
        assert!(point_in_any_rect((0, 0), &rects), "operator origin");
        assert!(point_in_any_rect((1920, 0), &rects), "external origin");
    }

    #[test]
    fn origin_of_unplugged_monitor_is_not_contained() {
        // External unplugged: only the operator screen remains, so the external
        // window's recorded origin (1920,0) is no longer covered → tear down.
        let rects = [OPERATOR];
        assert!(!point_in_any_rect((1920, 0), &rects));
        assert!(point_in_any_rect((0, 0), &rects), "operator still there");
    }

    #[test]
    fn empty_monitor_set_contains_nothing() {
        assert!(!point_in_any_rect((0, 0), &[]));
    }

    #[test]
    fn point_on_far_edge_is_excluded() {
        // The right/bottom edges are exclusive so adjacent monitors don't both
        // claim the shared boundary pixel.
        assert!(!point_in_any_rect((1920, 0), &[OPERATOR]));
        assert!(!point_in_any_rect((0, 1080), &[OPERATOR]));
    }
}
