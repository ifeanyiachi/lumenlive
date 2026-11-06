pub const EVENT_AUDIO_LEVEL: &str = "audio_level";
pub const EVENT_TRANSCRIPT_PARTIAL: &str = "transcript_partial";
pub const EVENT_TRANSCRIPT_FINAL: &str = "transcript_final";
pub const EVENT_AUDIO_SOURCE_LOST: &str = "audio_source_lost";
pub const EVENT_AUDIO_SOURCE_RECOVERED: &str = "audio_source_recovered";
/// Audio-seconds streamed to the STT provider since the previous emit (a delta,
/// not a running total). The frontend forwards this to the platform metering
/// endpoint so free/trial minute allowances can be enforced. Counted at the
/// session-level audio fan-out, so it survives provider reconnects.
pub const EVENT_TRANSCRIPTION_USAGE: &str = "transcription_usage";
/// The STT provider's API key was rejected by the STT service (HTTP 401). Kept
/// distinct from the generic `stt_error` so the frontend can flag a BYO key as
/// invalid (and report it to the backend) rather than showing a generic failure.
pub const EVENT_STT_UNAUTHORIZED: &str = "stt_unauthorized";
/// A broadcast output's physical display was disconnected (e.g. HDMI unplugged).
/// The backend keeps the output *enabled* and holds its window hidden (not torn
/// down), so the control UI just informs the operator and waits — the output
/// resumes automatically when the display returns (see `display_watch.rs`).
pub const EVENT_OUTPUT_DISPLAY_DISCONNECTED: &str = "output_display_disconnected";
/// A previously-disconnected broadcast display has returned (HDMI plugged back
/// in). The backend has re-shown the output window on the reattached monitor;
/// the control UI clears its "reconnecting" state and re-pushes current content.
pub const EVENT_OUTPUT_DISPLAY_CONNECTED: &str = "output_display_connected";

#[derive(Clone, serde::Serialize)]
pub struct AudioLevelPayload {
    pub rms: f32,
    pub peak: f32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionUsagePayload {
    /// Audio seconds consumed since the previous emit (a delta, not a total).
    pub seconds: f64,
}

#[derive(Clone, serde::Serialize)]
pub struct TranscriptPayload {
    pub text: String,
    pub is_final: bool,
    pub confidence: f64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDisplayDisconnectedPayload {
    /// The output whose projector/HDMI display was unplugged.
    pub output_id: String,
    /// True when NDI is still sending for this output: the physical screen is
    /// gone but the network feed continues, so the output stays "live".
    pub ndi_active: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDisplayConnectedPayload {
    /// The output whose projector/HDMI display was plugged back in.
    pub output_id: String,
}
