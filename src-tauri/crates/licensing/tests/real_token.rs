//! End-to-end integration point (betaplan Phase C): prove the *embedded* public
//! key actually verifies a token the live LumenBO backend signed with its real
//! `LICENSE_PRIVATE_KEY`. This is the one cross-repo coupling that unit tests
//! (which sign with an ephemeral key) can't cover — a key-pair mismatch or a
//! claim-shape drift would slip through until here.
//!
//! It reads a real token from the environment, so it is a no-op in a normal
//! `cargo test` run and only does real work when the e2e driver supplies:
//!   E2E_LICENSE_TOKEN  — a token minted by `POST /v1/licenses/activate`
//!   E2E_MACHINE_ID     — the machine id that token was node-locked to
//!   E2E_EXPECT_TIER    — (optional) the tier to assert, e.g. `pro`

use lumenlive_licensing::verify_license;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn embedded_key_verifies_a_real_backend_token() {
    let token = match std::env::var("E2E_LICENSE_TOKEN") {
        Ok(t) if !t.is_empty() => t,
        _ => {
            eprintln!("skip: E2E_LICENSE_TOKEN not set (run via the e2e driver)");
            return;
        }
    };
    let machine_id = std::env::var("E2E_MACHINE_ID").unwrap_or_default();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let result = verify_license(&token, &machine_id, now);
    assert!(
        result.valid,
        "real backend token failed offline verify against the embedded key: reason={}",
        result.reason
    );

    let claims = result.claims.expect("valid ⇒ claims present");
    assert_eq!(
        claims.machine_id, machine_id,
        "token is node-locked to a different machine"
    );

    if let Ok(expect) = std::env::var("E2E_EXPECT_TIER") {
        if !expect.is_empty() {
            assert_eq!(claims.tier, expect, "unexpected tier in verified token");
        }
    }

    println!(
        "OK  embedded key verified a real backend token: tier={} features={} \
         maxDevices={} trialEnd={:?} expiresAt={}",
        claims.tier,
        claims.features.len(),
        claims.limits.max_devices,
        claims.trial_end,
        claims.expires_at,
    );
}
