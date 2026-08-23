pub const EVENT_AUDIO_LEVEL: &str = "audio_level";
pub const EVENT_TRANSCRIPT_PARTIAL: &str = "transcript_partial";
pub const EVENT_TRANSCRIPT_FINAL: &str = "transcript_final";
pub const EVENT_AUDIO_SOURCE_LOST: &str = "audio_source_lost";
pub const EVENT_AUDIO_SOURCE_RECOVERED: &str = "audio_source_recovered";
/// A broadcast output's physical display was disconnected (e.g. HDMI unplugged)
/// and the backend has torn its output window down. The control UI reacts by
/// switching the output off (see `display_watch.rs`).
pub const EVENT_OUTPUT_DISPLAY_DISCONNECTED: &str = "output_display_disconnected";

#[derive(Clone, serde::Serialize)]
pub struct AudioLevelPayload {
    pub rms: f32,
    pub peak: f32,
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
