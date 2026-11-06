//! Offline license verification for the LumenLive desktop client (betaplan
//! Phase C, step 1).
//!
//! LumenBO signs a node-locked EdDSA (Ed25519) JWT with a private key that never
//! leaves the server. This crate holds the matching **public** key (embedded
//! below) and verifies a token entirely offline — no network, no secret. It is
//! deliberately pure: given a token, the current machine id, and the current
//! time, it returns a decision. All host concerns (reading the real machine id,
//! the wall clock, HTTP) live in the Tauri command layer so this stays testable.
//!
//! ## The offline validity rules (betaplan §1 hybrid expiry)
//!
//! A token carries a short `exp` (~7 days) that forces periodic online
//! re-validation, plus a `grace` window (days) and — for trials/subscriptions —
//! a `trialEnd` timestamp that is the *real* access deadline. A token still
//! confers its tier while ALL of these hold:
//!   1. the Ed25519 signature verifies against the embedded key,
//!   2. `iss` / `aud` match this client,
//!   3. the token's `mid` equals THIS machine (node-lock),
//!   4. `trialEnd` (when present) has not passed, and
//!   5. `now < exp + grace·days` (fresh, or inside the offline grace window).
//!
//! Any failure resolves to **Free** — the client falls back to the Free feature
//! set (which this crate does not encode; the frontend owns that default).

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// The token issuer LumenBO stamps (`iss`). Must match `license-crypto.ts`.
const ISS: &str = "lumenlive.xyz";
/// The intended audience (`aud`) — this desktop client.
const AUD: &str = "lumenlive-desktop";
/// Seconds in a day, for the grace-window arithmetic.
const DAY_SECS: i64 = 86_400;

/// The embedded license **public** key (SPKI PEM), handed off from LumenBO's
/// `LICENSE_PUBLIC_KEY`. Safe to ship — it only verifies, never signs.
const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----\n\
MCowBQYDK2VwAyEANXdMx7tapgBTh651FuPH9ffRgRx7RjNNufajrGikYPU=\n\
-----END PUBLIC KEY-----\n";

/// Per-tier numeric limits (`-1` = unlimited). Mirrors LumenBO's `PlanLimits`
/// and the frontend `entitlements` shape (camelCase on the wire).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub max_devices: i64,
    pub max_translations: i64,
    pub max_transcription_minutes: i64,
}

/// The verified, still-valid claims from a license token.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedClaims {
    /// User id (`sub`).
    pub sub: String,
    pub tier: String,
    pub features: Vec<String>,
    pub limits: Limits,
    /// The machine this token is locked to (`mid`).
    pub machine_id: String,
    /// Real access deadline (unix secs); `None` for a perpetual/Free token.
    pub trial_end: Option<i64>,
    /// Short online-revalidation deadline (unix secs).
    pub expires_at: i64,
    pub issued_at: i64,
    /// Offline grace days the client honours past `expires_at`.
    pub grace_days: i64,
}

/// The outcome of verifying a token. `valid: false` always means "fall back to
/// Free"; `reason` explains why (useful for account-screen messaging such as
/// "trial ended" vs "needs re-validation").
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    pub valid: bool,
    /// `ok` | `malformed` | `signature` | `issuer` | `audience` |
    /// `machine_mismatch` | `trial_ended` | `expired`
    pub reason: String,
    pub claims: Option<VerifiedClaims>,
}

impl VerifyResult {
    fn free(reason: &str) -> Self {
        Self {
            valid: false,
            reason: reason.to_string(),
            claims: None,
        }
    }
}

/// Raw JWT payload as signed by LumenBO. `jose` emits a string `aud` and stamps
/// `iat`/`exp`; `trialEnd` is omitted for Free tokens.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawClaims {
    sub: String,
    iss: String,
    aud: String,
    exp: i64,
    iat: i64,
    tier: String,
    features: Vec<String>,
    limits: Limits,
    mid: String,
    grace: i64,
    #[serde(default)]
    trial_end: Option<i64>,
}

/// Parse the embedded SPKI PEM into a verifying key. Panics only if the baked-in
/// key is malformed — a build-time bug, exercised by a test below.
fn embedded_key() -> VerifyingKey {
    use ed25519_dalek::pkcs8::DecodePublicKey;
    VerifyingKey::from_public_key_pem(PUBLIC_KEY_PEM)
        .expect("embedded license public key is a valid Ed25519 SPKI PEM")
}

/// Verify a license token offline against the embedded public key.
///
/// `machine_id` is THIS device's id; `now_unix` is the current time in unix
/// seconds. See the module docs for the full rule set. Any failure returns a
/// `valid: false` result — the caller then applies the Free default.
pub fn verify_license(token: &str, machine_id: &str, now_unix: i64) -> VerifyResult {
    verify_with_key(&embedded_key(), token, machine_id, now_unix)
}

/// Core verification, parameterised on the key so tests can sign with their own
/// ephemeral keypair. Not part of the public contract.
fn verify_with_key(
    key: &VerifyingKey,
    token: &str,
    machine_id: &str,
    now_unix: i64,
) -> VerifyResult {
    // 1. Structural parse: header.payload.signature
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return VerifyResult::free("malformed");
    }
    let signing_input = format!("{}.{}", parts[0], parts[1]);

    let url = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let Ok(sig_bytes) = url.decode(parts[2]) else {
        return VerifyResult::free("malformed");
    };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else {
        return VerifyResult::free("malformed");
    };

    // 2. Signature — reject anything tampered or signed by the wrong key.
    if key.verify(signing_input.as_bytes(), &sig).is_err() {
        return VerifyResult::free("signature");
    }

    // 3. Claims — decode only AFTER the signature is trusted.
    let Ok(payload_bytes) = url.decode(parts[1]) else {
        return VerifyResult::free("malformed");
    };
    let Ok(claims) = serde_json::from_slice::<RawClaims>(&payload_bytes) else {
        return VerifyResult::free("malformed");
    };

    if claims.iss != ISS {
        return VerifyResult::free("issuer");
    }
    if claims.aud != AUD {
        return VerifyResult::free("audience");
    }
    // 4. Node-lock: the token is bound to one machine.
    if claims.mid != machine_id {
        return VerifyResult::free("machine_mismatch");
    }
    // 5. Trial/subscription deadline — the real access cutoff.
    if let Some(trial_end) = claims.trial_end {
        if now_unix >= trial_end {
            return VerifyResult::free("trial_ended");
        }
    }
    // 6. Hybrid expiry: honour the tier until exp + grace days.
    let hard_expiry = claims.exp + claims.grace.max(0) * DAY_SECS;
    if now_unix >= hard_expiry {
        return VerifyResult::free("expired");
    }

    VerifyResult {
        valid: true,
        reason: "ok".to_string(),
        claims: Some(VerifiedClaims {
            sub: claims.sub,
            tier: claims.tier,
            features: claims.features,
            limits: claims.limits,
            machine_id: claims.mid,
            trial_end: claims.trial_end,
            expires_at: claims.exp,
            issued_at: claims.iat,
            grace_days: claims.grace,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;

    const MID: &str = "test-machine-0001";

    fn url_encode(bytes: &[u8]) -> String {
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    }

    /// Hand-roll a signed EdDSA JWT the way `jose` would, so tests exercise the
    /// real parse+verify path without needing LumenBO's private key.
    fn make_jwt(sk: &SigningKey, claims: serde_json::Value) -> String {
        let header = json!({ "alg": "EdDSA", "typ": "JWT" });
        let h = url_encode(header.to_string().as_bytes());
        let p = url_encode(claims.to_string().as_bytes());
        let signing_input = format!("{h}.{p}");
        let sig = sk.sign(signing_input.as_bytes());
        format!("{signing_input}.{}", url_encode(&sig.to_bytes()))
    }

    fn base_claims(now: i64) -> serde_json::Value {
        json!({
            "sub": "user-1",
            "iss": ISS,
            "aud": AUD,
            "iat": now,
            "exp": now + 7 * DAY_SECS,
            "tier": "pro",
            "features": ["ndi_output", "lexicon"],
            "limits": { "maxDevices": 5, "maxTranslations": -1, "maxTranscriptionMinutes": 60 },
            "mid": MID,
            "grace": 14,
            "trialEnd": now + 30 * DAY_SECS,
        })
    }

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    #[test]
    fn embedded_public_key_parses() {
        // The baked-in SPKI PEM must load — guards against a bad handoff paste.
        let _ = embedded_key();
    }

    #[test]
    fn accepts_a_fresh_valid_token() {
        let sk = key();
        let now = 1_700_000_000;
        let token = make_jwt(&sk, base_claims(now));
        let r = verify_with_key(&sk.verifying_key(), &token, MID, now);
        assert!(r.valid, "reason={}", r.reason);
        let c = r.claims.unwrap();
        assert_eq!(c.tier, "pro");
        assert_eq!(c.limits.max_devices, 5);
        assert_eq!(c.limits.max_translations, -1);
        assert_eq!(c.machine_id, MID);
    }

    #[test]
    fn rejects_wrong_machine() {
        let sk = key();
        let now = 1_700_000_000;
        let token = make_jwt(&sk, base_claims(now));
        let r = verify_with_key(&sk.verifying_key(), &token, "other-machine", now);
        assert!(!r.valid);
        assert_eq!(r.reason, "machine_mismatch");
    }

    #[test]
    fn rejects_tampered_signature() {
        let sk = key();
        let now = 1_700_000_000;
        // Sign with one key, verify with a different embedded key.
        let token = make_jwt(&sk, base_claims(now));
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let r = verify_with_key(&other.verifying_key(), &token, MID, now);
        assert!(!r.valid);
        assert_eq!(r.reason, "signature");
    }

    #[test]
    fn rejects_tampered_payload() {
        let sk = key();
        let now = 1_700_000_000;
        let token = make_jwt(&sk, base_claims(now));
        // Swap the payload segment for an escalated one; signature no longer fits.
        let mut parts: Vec<String> = token.split('.').map(String::from).collect();
        let mut hacked = base_claims(now);
        hacked["limits"]["maxDevices"] = json!(999);
        parts[1] = url_encode(hacked.to_string().as_bytes());
        let forged = parts.join(".");
        let r = verify_with_key(&sk.verifying_key(), &forged, MID, now);
        assert!(!r.valid);
        assert_eq!(r.reason, "signature");
    }

    #[test]
    fn rejects_ended_trial_even_within_exp() {
        let sk = key();
        let now = 1_700_000_000;
        let mut claims = base_claims(now);
        claims["trialEnd"] = json!(now - 1); // trial already over
        let token = make_jwt(&sk, claims);
        let r = verify_with_key(&sk.verifying_key(), &token, MID, now);
        assert!(!r.valid);
        assert_eq!(r.reason, "trial_ended");
    }

    #[test]
    fn honours_grace_window_after_exp() {
        let sk = key();
        let now = 1_700_000_000;
        let mut claims = base_claims(now);
        // exp already passed, but within the 14-day grace and before trialEnd.
        claims["exp"] = json!(now - DAY_SECS);
        claims["grace"] = json!(14);
        claims["trialEnd"] = json!(now + 30 * DAY_SECS);
        let token = make_jwt(&sk, claims);
        let r = verify_with_key(&sk.verifying_key(), &token, MID, now);
        assert!(r.valid, "reason={}", r.reason);
    }

    #[test]
    fn rejects_past_grace_window() {
        let sk = key();
        let now = 1_700_000_000;
        let mut claims = base_claims(now);
        claims["exp"] = json!(now - 20 * DAY_SECS); // 20d ago
        claims["grace"] = json!(14); // grace ran out 6d ago
        claims["trialEnd"] = json!(now + 30 * DAY_SECS);
        let token = make_jwt(&sk, claims);
        let r = verify_with_key(&sk.verifying_key(), &token, MID, now);
        assert!(!r.valid);
        assert_eq!(r.reason, "expired");
    }

    #[test]
    fn free_token_without_trial_end_is_bounded_only_by_grace() {
        let sk = key();
        let now = 1_700_000_000;
        let mut claims = base_claims(now);
        claims.as_object_mut().unwrap().remove("trialEnd");
        claims["tier"] = json!("free");
        let token = make_jwt(&sk, claims);
        let r = verify_with_key(&sk.verifying_key(), &token, MID, now);
        assert!(r.valid, "reason={}", r.reason);
        assert_eq!(r.claims.unwrap().trial_end, None);
    }

    #[test]
    fn rejects_wrong_issuer_and_audience() {
        let sk = key();
        let now = 1_700_000_000;

        let mut bad_iss = base_claims(now);
        bad_iss["iss"] = json!("evil.example");
        let r = verify_with_key(&sk.verifying_key(), &make_jwt(&sk, bad_iss), MID, now);
        assert_eq!(r.reason, "issuer");

        let mut bad_aud = base_claims(now);
        bad_aud["aud"] = json!("some-other-app");
        let r = verify_with_key(&sk.verifying_key(), &make_jwt(&sk, bad_aud), MID, now);
        assert_eq!(r.reason, "audience");
    }

    #[test]
    fn rejects_malformed_tokens() {
        let sk = key();
        assert_eq!(
            verify_with_key(&sk.verifying_key(), "not-a-jwt", MID, 0).reason,
            "malformed"
        );
        assert_eq!(
            verify_with_key(&sk.verifying_key(), "a.b", MID, 0).reason,
            "malformed"
        );
    }
}
