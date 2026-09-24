//! Licensing commands (betaplan Phase C, step 1): the host-facing edge of the
//! pure `lumenlive-licensing` crate. These three commands give the frontend the
//! device identity it activates with and an offline token check that never
//! touches the network.
//!
//! - `get_machine_id` — the stable per-machine id the token is node-locked to.
//! - `os_info` — device metadata for the activation payload / Account screen.
//! - `verify_license` — verify a stored token offline against the embedded
//!   public key at the current wall-clock time. Any failure → `valid: false`,
//!   and the frontend applies its Free default.

use lumenlive_licensing::VerifyResult;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Device metadata used to name a device on activation and shown in Account
/// settings. `os` + `version` + `arch` compose the `osInfo` string LumenBO
/// stores; `hostname` becomes `machineName`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub os: String,
    pub version: String,
    pub arch: String,
    pub hostname: String,
}

/// The stable machine id this device's license is locked to. Errors as a string
/// so the frontend can degrade to Free rather than crash on an unusual host.
#[tauri::command]
pub fn get_machine_id() -> Result<String, String> {
    machine_uid::get().map_err(|e| e.to_string())
}

/// Human/host metadata for the activation payload and Account screen.
#[tauri::command]
pub fn os_info() -> OsInfo {
    OsInfo {
        os: sysinfo::System::name().unwrap_or_else(|| "Unknown".to_string()),
        version: sysinfo::System::long_os_version()
            .or_else(sysinfo::System::os_version)
            .unwrap_or_else(|| "Unknown".to_string()),
        arch: std::env::consts::ARCH.to_string(),
        hostname: sysinfo::System::host_name().unwrap_or_else(|| "Unknown".to_string()),
    }
}

/// Verify a license token offline against the embedded public key, node-locked
/// to `machine_id`, at the current time. Delegates all crypto/expiry logic to
/// the pure crate; this wrapper only supplies "now".
#[tauri::command]
pub fn verify_license(token: String, machine_id: String) -> VerifyResult {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    lumenlive_licensing::verify_license(&token, &machine_id, now)
}

/// An HTTP request to the LumenBO API, issued from Rust so licensing traffic
/// never widens the webview CSP (same rationale as the lyrics/resource-store
/// gateways). The frontend composes the full URL from `VITE_LUMENBO_URL`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensingRequest {
    pub url: String,
    pub method: String,
    /// Bearer token for authenticated `/v1/*` calls; omitted for sign-in.
    pub token: Option<String>,
    /// `Origin` header — better-auth requires a trusted origin on its auth
    /// endpoints, and `reqwest` sends none by default.
    pub origin: Option<String>,
    pub body: Option<serde_json::Value>,
}

/// The raw response, handed back to `lumenbo-client.ts` to unwrap the envelope.
/// `headers` is lower-cased so the client can read better-auth's
/// `set-auth-token` after sign-in.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensingResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

/// Perform a licensing/auth HTTP request against LumenBO. Network/transport
/// failures surface as `Err(String)`; HTTP error *statuses* (401/409/…) come
/// back as an `Ok` response for the client to interpret against the envelope.
#[tauri::command]
pub async fn licensing_request(
    req: LicensingRequest,
) -> Result<LicensingResponse, String> {
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;

    // Update policy is checked before the frontend mounts, so every request
    // must have a finite timeout or an unavailable server could prevent the
    // desktop shell from ever reaching its retry screen.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut builder = client.request(method, &req.url);
    if let Some(token) = req.token {
        builder = builder.bearer_auth(token);
    }
    if let Some(origin) = req.origin {
        builder = builder.header("Origin", origin);
    }
    if let Some(body) = req.body {
        builder = builder.json(&body);
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();

    let mut headers = HashMap::new();
    for (name, value) in resp.headers() {
        if let Ok(s) = value.to_str() {
            headers.insert(name.as_str().to_lowercase(), s.to_string());
        }
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(LicensingResponse {
        status,
        body,
        headers,
    })
}
