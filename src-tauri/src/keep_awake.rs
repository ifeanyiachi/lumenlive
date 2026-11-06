//! OS wake lock: keep the display and system awake while `LumenLive` is actively
//! driving a broadcast output.
//!
//! A live service can run for a long stretch with no keyboard/mouse input from
//! the operator — the machine's idle timer then dims and powers off the display
//! (and can sleep the system) *mid-service*, blanking the projector or freezing
//! the NDI feed. While any broadcast output is live we ask the OS to hold the
//! display and system awake, and we release the moment the last output goes away
//! so we never pin the machine awake longer than a service actually needs.
//!
//! ## Why a dedicated thread
//!
//! On Windows the wake lock is `SetThreadExecutionState`, which is *thread
//! local*: the flag stays in effect only while the thread that set it is alive,
//! and the matching reset must run on that same thread. Tauri command handlers
//! run on a pool of async worker threads, so engaging/releasing straight from a
//! command would set the flag on one throwaway thread and reset it on another —
//! leaking the lock or clearing the wrong thread. So the actual engage/release
//! (and the guard's `Drop`) all happen on one long-lived worker thread owned by
//! this module; commands only send it cheap acquire/release messages.
//!
//! ## Why tokens, not a counter
//!
//! Each active output registers a distinct token (`display:main`, `ndi:main`,
//! …). The lock is engaged exactly while at least one token is present. Tracking
//! a set of tokens rather than a bare integer makes acquire/release idempotent:
//! a duplicate open, or a stop delivered twice, can't unbalance the count and
//! either strand the lock on forever or drop it while an output is still live.

use std::collections::HashSet;

use crossbeam_channel::{unbounded, Sender};

/// Wake-lock token for a physical broadcast output *window* (projector / stage
/// display) shown on `output_id`.
pub fn display_token(output_id: &str) -> String {
    format!("display:{output_id}")
}

/// Wake-lock token for an active NDI sender on `output_id`.
pub fn ndi_token(output_id: &str) -> String {
    format!("ndi:{output_id}")
}

/// The set of reasons the machine must currently stay awake. Pure logic, no OS
/// calls, so it is unit-testable on every platform.
#[derive(Default)]
struct ActiveSet(HashSet<String>);

impl ActiveSet {
    /// Register a token. Returns `true` only when this flips the requirement
    /// off→on (i.e. the wake lock now needs engaging).
    fn insert(&mut self, token: String) -> bool {
        let was_awake = self.awake();
        self.0.insert(token);
        !was_awake && self.awake()
    }

    /// Drop a token. Returns `true` only when this flips the requirement on→off
    /// (i.e. the wake lock should now be released).
    fn remove(&mut self, token: &str) -> bool {
        let was_awake = self.awake();
        self.0.remove(token);
        was_awake && !self.awake()
    }

    /// Whether at least one output currently requires the machine awake.
    fn awake(&self) -> bool {
        !self.0.is_empty()
    }
}

enum Cmd {
    Acquire(String),
    Release(String),
}

/// Managed handle to the wake-lock worker thread.
///
/// `acquire`/`release` are non-blocking and thread-safe, so Tauri commands can
/// call them directly (no `Mutex` wrapper needed). Tokens should be built with
/// [`display_token`] / [`ndi_token`] so the same output uses the same key across
/// its acquire and release.
pub struct WakeLock {
    tx: Sender<Cmd>,
}

impl WakeLock {
    /// Spawn the worker thread that owns the OS wake lock for the app's
    /// lifetime.
    pub fn new() -> Self {
        let (tx, rx) = unbounded::<Cmd>();
        std::thread::Builder::new()
            .name("lumenlive-wakelock".into())
            .spawn(move || run_worker(&rx))
            .expect("failed to spawn wake-lock worker thread");
        Self { tx }
    }

    /// Register `token` as an active reason to stay awake (idempotent).
    pub fn acquire(&self, token: String) {
        // A closed channel only happens if the worker thread died; the service
        // simply loses its keep-awake, which is non-fatal — so ignore send err.
        let _ = self.tx.send(Cmd::Acquire(token));
    }

    /// Drop `token`; the OS lock releases once no tokens remain (idempotent).
    pub fn release(&self, token: String) {
        let _ = self.tx.send(Cmd::Release(token));
    }
}

impl Default for WakeLock {
    fn default() -> Self {
        Self::new()
    }
}

/// The worker loop. Owns the OS guard so it is both created and dropped on this
/// one thread (load-bearing on Windows — see the module docs). Exits when every
/// `Sender` is dropped (app shutdown), at which point the guard drops and the
/// OS wake lock is released.
fn run_worker(rx: &crossbeam_channel::Receiver<Cmd>) {
    let mut active = ActiveSet::default();

    // The keepawake guard lives here for as long as an output is active. It is
    // `None` while nothing needs the machine awake.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let mut guard: Option<keepawake::KeepAwake> = None;

    while let Ok(cmd) = rx.recv() {
        let flipped = match cmd {
            Cmd::Acquire(token) => active.insert(token),
            Cmd::Release(token) => active.remove(&token),
        };

        // Only OS-touch on an actual off→on / on→off transition.
        if !flipped {
            continue;
        }

        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        {
            // Read `guard` (is_none/is_some) before writing it: engage only when
            // not already engaged, release only when engaged. The value is held
            // purely for its `Drop` — dropping it is what releases the OS lock.
            if active.awake() {
                if guard.is_none() {
                    guard = engage();
                }
            } else if guard.is_some() {
                // Drop the guard on this thread → OS wake lock released.
                guard = None;
                log::info!("Keep-awake released: no broadcast output active");
            }
        }
    }
}

/// Engage the OS wake lock. Best-effort: a failure is logged and leaves the
/// service running without keep-awake rather than aborting anything.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn engage() -> Option<keepawake::KeepAwake> {
    match keepawake::Builder::default()
        .display(true)
        .idle(true)
        .reason("LumenLive is driving a live broadcast output")
        .app_name("LumenLive")
        .app_reverse_domain("live.lumen.app")
        .create()
    {
        Ok(guard) => {
            log::info!("Keep-awake engaged: broadcast output active");
            Some(guard)
        }
        Err(e) => {
            log::warn!("Failed to engage keep-awake wake lock: {e}");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ActiveSet;

    #[test]
    fn first_token_flips_awake_on_once() {
        let mut s = ActiveSet::default();
        assert!(s.insert("display:main".into()), "first token engages");
        assert!(s.awake());
    }

    #[test]
    fn additional_tokens_do_not_re_engage() {
        let mut s = ActiveSet::default();
        assert!(s.insert("display:main".into()));
        assert!(
            !s.insert("ndi:main".into()),
            "already awake — no re-engage"
        );
        assert!(s.awake());
    }

    #[test]
    fn duplicate_acquire_is_idempotent() {
        let mut s = ActiveSet::default();
        assert!(s.insert("display:main".into()));
        assert!(
            !s.insert("display:main".into()),
            "same token twice must not flip again"
        );
        // A single release still clears it — the dup did not inflate a count.
        assert!(s.remove("display:main"));
        assert!(!s.awake());
    }

    #[test]
    fn lock_holds_until_last_token_released() {
        let mut s = ActiveSet::default();
        s.insert("display:main".into());
        s.insert("ndi:main".into());
        assert!(
            !s.remove("display:main"),
            "still one output live — stay awake"
        );
        assert!(s.awake());
        assert!(s.remove("ndi:main"), "last output gone — release");
        assert!(!s.awake());
    }

    #[test]
    fn releasing_unknown_token_is_a_noop() {
        let mut s = ActiveSet::default();
        assert!(!s.remove("ndi:main"), "nothing was held");
        assert!(!s.awake());
        s.insert("display:main".into());
        assert!(
            !s.remove("ndi:main"),
            "removing an absent token leaves the held one engaged"
        );
        assert!(s.awake());
    }
}
