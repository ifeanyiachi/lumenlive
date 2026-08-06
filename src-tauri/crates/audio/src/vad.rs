use crate::meter;
use crate::types::AudioFrame;

/// Configuration for the energy VAD.
///
/// All timing thresholds are expressed in **milliseconds**, not frame counts.
/// A "frame" is whatever `Vec<i16>` the OS audio callback hands us per tick,
/// and that size is device/driver-dependent (WASAPI shared-mode buffers vary),
/// so counting frames made the effective silence window unpredictable across
/// machines. We convert each incoming frame's sample count to a real duration
/// via [`VadConfig::sample_rate`], so "700 ms of silence" means 700 ms on every
/// device.
#[derive(Debug, Clone)]
pub struct VadConfig {
    /// RMS level below which a frame is considered silence (0.0-1.0).
    pub silence_threshold: f32,
    /// Per-frame voice energy threshold.
    pub frame_threshold: f32,
    /// Overall voice probability threshold (ratio of voiced frames in window).
    /// Reserved — not currently consulted by the state machine.
    pub overall_threshold: f32,
    /// Sample rate of the incoming audio, used to convert a frame's sample
    /// count into a duration in milliseconds.
    pub sample_rate: u32,
    /// Silence (ms) tolerated inside a live utterance before it is treated as a
    /// *pause* and the VAD enters the [`VadState::Trailing`] hangover window.
    pub end_silence_ms: u32,
    /// Additional silence (ms) tolerated during the hangover. Speech that
    /// resumes anywhere within `end_silence_ms + resume_grace_ms` continues the
    /// **same** utterance (no `SpeechEnded`/`SpeechStarted` churn); only once the
    /// full window elapses in silence is the utterance finalized. This is what
    /// keeps deliberate mid-verse pauses (commas, breaths) from chopping a
    /// single verse into fragments.
    pub resume_grace_ms: u32,
    /// Minimum voiced audio (ms) before transitioning Silence → Speech.
    pub min_voice_ms: u32,
    /// Maximum utterance length (ms) before force-flushing. A generous backstop
    /// for a speaker who never pauses; normal sentence pauses end the utterance
    /// via `end_silence_ms` long before this fires.
    pub max_utterance_ms: u32,
    /// Amount of pre-speech audio (ms) to retain so the onset of the first word
    /// isn't clipped when Speech starts.
    pub pre_buffer_ms: u32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            silence_threshold: 0.005,
            frame_threshold: 0.0025,
            overall_threshold: 0.05,
            sample_rate: 16_000,
            end_silence_ms: 700,     // pause tolerated before the hangover
            resume_grace_ms: 400,    // extra pause tolerated in the hangover
            min_voice_ms: 250,       // voiced audio needed to start
            max_utterance_ms: 15_000, // hard backstop on a single utterance
            pre_buffer_ms: 250,      // pre-speech audio kept to capture onset
        }
    }
}

/// VAD state machine states.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadState {
    /// No speech detected. Audio is NOT forwarded.
    Silence,
    /// Speech detected. Audio IS forwarded.
    Speech,
    /// A pause inside a live utterance: silence has passed `end_silence_ms` but
    /// the `resume_grace_ms` hangover has not yet elapsed. Audio is still
    /// forwarded and the utterance is still open — if speech resumes here it
    /// continues seamlessly; only if the hangover fully elapses does the
    /// utterance finalize.
    Trailing,
}

/// Voice Activity Detector that gates audio frames.
///
/// Only frames during Speech/Trailing states are forwarded to the consumer.
/// Uses energy-based detection via RMS levels from the existing meter module.
/// All timers are tracked in milliseconds derived from each frame's real sample
/// count, so behaviour is independent of the OS audio buffer size.
pub struct Vad {
    config: VadConfig,
    state: VadState,
    /// Consecutive voiced audio (ms) — drives the Silence→Speech transition.
    voice_ms: f32,
    /// Consecutive silent audio (ms) since the last voiced frame — drives the
    /// Speech→Trailing transition.
    silence_ms: f32,
    /// Silent audio (ms) accumulated inside the Trailing hangover — drives the
    /// Trailing→Silence (finalize) transition.
    trailing_ms: f32,
    /// Total duration (ms) of the current utterance (for the max-length backstop).
    utterance_ms: f32,
    /// Pre-buffer of recent frames kept during Silence (captures speech onset).
    pre_buffer: Vec<AudioFrame>,
    /// Running duration (ms) of the frames currently in `pre_buffer`.
    pre_buffer_ms: f32,
}

impl Vad {
    pub fn new(config: VadConfig) -> Self {
        Self {
            pre_buffer: Vec::new(),
            config,
            state: VadState::Silence,
            voice_ms: 0.0,
            silence_ms: 0.0,
            trailing_ms: 0.0,
            utterance_ms: 0.0,
            pre_buffer_ms: 0.0,
        }
    }

    /// Returns the current VAD state.
    pub fn state(&self) -> VadState {
        self.state
    }

    /// Duration of a frame in milliseconds, from its sample count.
    #[expect(
        clippy::cast_precision_loss,
        reason = "sample counts and sample rates are far below f32's exact-integer range"
    )]
    fn frame_ms(&self, frame: &AudioFrame) -> f32 {
        frame.samples.len() as f32 * 1000.0 / self.config.sample_rate.max(1) as f32
    }

    /// Push a frame into the pre-speech buffer, evicting the oldest frames while
    /// the buffered duration exceeds `pre_buffer_ms`.
    fn push_pre_buffer(&mut self, frame: &AudioFrame, frame_ms: f32) {
        self.pre_buffer.push(frame.clone());
        self.pre_buffer_ms += frame_ms;
        #[expect(
            clippy::cast_precision_loss,
            reason = "pre_buffer_ms config is small; no meaningful precision loss"
        )]
        let cap_ms = self.config.pre_buffer_ms as f32;
        while self.pre_buffer_ms > cap_ms && !self.pre_buffer.is_empty() {
            let dropped = self.pre_buffer.remove(0);
            self.pre_buffer_ms -= self.frame_ms(&dropped);
        }
    }

    /// Finalize the current utterance: reset all timers and clear the
    /// pre-buffer. Callers emit `SpeechEnded` alongside this.
    fn finalize(&mut self) {
        self.state = VadState::Silence;
        self.voice_ms = 0.0;
        self.silence_ms = 0.0;
        self.trailing_ms = 0.0;
        self.utterance_ms = 0.0;
        self.pre_buffer.clear();
        self.pre_buffer_ms = 0.0;
    }

    /// Process an audio frame and return frames to forward (may be empty).
    ///
    /// During Silence: frames are buffered but not forwarded.
    /// On Speech start: the pre-buffer + current frame are flushed.
    /// During Speech/Trailing: frames are forwarded immediately.
    /// On transition to Silence: returns empty (trailing audio gated).
    ///
    /// Also returns a state transition event if the state changed. Note that a
    /// pause that resumes within the hangover produces **no** transition — the
    /// utterance is treated as continuous.
    #[expect(
        clippy::too_many_lines,
        reason = "one contiguous state machine; splitting the arms would obscure the transition flow"
    )]
    pub fn process(&mut self, frame: &AudioFrame) -> VadResult {
        let level = meter::compute_level(&frame.samples);
        let is_voiced = level.rms >= self.config.silence_threshold
            && level.rms >= self.config.frame_threshold;
        let frame_ms = self.frame_ms(frame);
        #[expect(
            clippy::cast_precision_loss,
            reason = "ms config values are small; no meaningful precision loss"
        )]
        let (end_silence_ms, resume_grace_ms, min_voice_ms, max_utterance_ms) = (
            self.config.end_silence_ms as f32,
            self.config.resume_grace_ms as f32,
            self.config.min_voice_ms as f32,
            self.config.max_utterance_ms as f32,
        );

        match self.state {
            VadState::Silence => {
                if is_voiced {
                    self.voice_ms += frame_ms;
                    if self.voice_ms >= min_voice_ms {
                        // Transition to Speech
                        self.state = VadState::Speech;
                        self.silence_ms = 0.0;
                        self.trailing_ms = 0.0;

                        // Flush pre-buffer + current frame
                        let mut frames: Vec<AudioFrame> = self.pre_buffer.drain(..).collect();
                        frames.push(frame.clone());
                        self.utterance_ms = self.pre_buffer_ms + frame_ms;
                        self.pre_buffer_ms = 0.0;

                        log::debug!(
                            "[VAD] Silence -> Speech (flushed {} pre-buffer frames)",
                            frames.len() - 1,
                        );
                        return VadResult {
                            frames,
                            transition: Some(VadTransition::SpeechStarted),
                        };
                    }
                } else {
                    self.voice_ms = 0.0;
                }

                // Buffer frame for pre-speech capture
                self.push_pre_buffer(frame, frame_ms);

                VadResult {
                    frames: vec![],
                    transition: None,
                }
            }

            VadState::Speech => {
                self.utterance_ms += frame_ms;

                // Force-flush on max utterance length
                if self.utterance_ms >= max_utterance_ms {
                    log::debug!(
                        "[VAD] Speech -> Silence FORCED (max_utterance={:.0}ms)",
                        self.utterance_ms,
                    );
                    self.finalize();
                    return VadResult {
                        frames: vec![frame.clone()],
                        transition: Some(VadTransition::SpeechEnded),
                    };
                }

                if is_voiced {
                    self.silence_ms = 0.0;
                } else {
                    self.silence_ms += frame_ms;
                    if self.silence_ms >= end_silence_ms {
                        // Enter the hangover window rather than finalizing. The
                        // utterance stays open; this frame's silence is not
                        // re-counted toward the grace window.
                        self.state = VadState::Trailing;
                        self.trailing_ms = 0.0;
                        log::debug!(
                            "[VAD] Speech -> Trailing (pause after {:.0}ms utterance)",
                            self.utterance_ms,
                        );
                    }
                }

                // Forward the frame (trailing silence within the utterance is
                // kept so a resumed utterance stays continuous).
                VadResult {
                    frames: vec![frame.clone()],
                    transition: None,
                }
            }

            VadState::Trailing => {
                self.utterance_ms += frame_ms;

                // Force-flush on max utterance length even mid-pause.
                if self.utterance_ms >= max_utterance_ms {
                    log::debug!(
                        "[VAD] Trailing -> Silence FORCED (max_utterance={:.0}ms)",
                        self.utterance_ms,
                    );
                    self.finalize();
                    return VadResult {
                        frames: vec![],
                        transition: Some(VadTransition::SpeechEnded),
                    };
                }

                if is_voiced {
                    // Speech resumed within the hangover — continue the SAME
                    // utterance. No transition is emitted.
                    self.state = VadState::Speech;
                    self.silence_ms = 0.0;
                    self.trailing_ms = 0.0;
                    log::debug!("[VAD] Trailing -> Speech (utterance resumed)");
                    return VadResult {
                        frames: vec![frame.clone()],
                        transition: None,
                    };
                }

                self.trailing_ms += frame_ms;
                if self.trailing_ms >= resume_grace_ms {
                    log::debug!(
                        "[VAD] Trailing -> Silence (utterance={:.0}ms, finalized)",
                        self.utterance_ms,
                    );
                    self.finalize();
                    return VadResult {
                        frames: vec![], // Don't forward trailing silence on end
                        transition: Some(VadTransition::SpeechEnded),
                    };
                }

                // Still within the hangover — keep forwarding so a resume stays
                // continuous.
                VadResult {
                    frames: vec![frame.clone()],
                    transition: None,
                }
            }
        }
    }

    /// Reset the VAD state (e.g., when stopping transcription).
    pub fn reset(&mut self) {
        self.finalize();
    }
}

/// Result of processing a single audio frame through the VAD.
pub struct VadResult {
    /// Frames to forward to the consumer (empty if gated).
    pub frames: Vec<AudioFrame>,
    /// State transition that occurred, if any.
    pub transition: Option<VadTransition>,
}

/// VAD state transitions emitted as events.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VadTransition {
    SpeechStarted,
    SpeechEnded,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Frames are a fixed 100 ms (1600 samples @ 16 kHz) so the ms-based
    /// thresholds map to whole numbers of frames in these tests.
    const FRAME_MS: u32 = 100;
    const SAMPLES_PER_FRAME: usize = 1600; // 16_000 * 0.1

    fn make_frame(rms_level: f32) -> AudioFrame {
        // Create a frame with samples that produce roughly the desired RMS level
        let amplitude = (rms_level * f32::from(i16::MAX)) as i16;
        let samples = vec![amplitude; SAMPLES_PER_FRAME];
        AudioFrame {
            samples,
            timestamp_ms: 0,
        }
    }

    fn silent_frame() -> AudioFrame {
        make_frame(0.0)
    }

    fn voiced_frame() -> AudioFrame {
        make_frame(0.05) // Well above silence_threshold of 0.005
    }

    #[test]
    fn test_starts_in_silence() {
        let vad = Vad::new(VadConfig::default());
        assert_eq!(vad.state(), VadState::Silence);
    }

    #[test]
    fn test_silence_gates_audio() {
        let mut vad = Vad::new(VadConfig::default());
        let result = vad.process(&silent_frame());
        assert!(result.frames.is_empty());
        assert!(result.transition.is_none());
    }

    #[test]
    fn test_speech_detection() {
        // Needs 2 frames (200 ms) of voice to start.
        let config = VadConfig {
            min_voice_ms: 2 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // First voiced frame: not enough yet
        let result = vad.process(&voiced_frame());
        assert!(result.frames.is_empty());
        assert_eq!(vad.state(), VadState::Silence);

        // Second voiced frame: transition to Speech
        let result = vad.process(&voiced_frame());
        assert!(!result.frames.is_empty());
        assert_eq!(vad.state(), VadState::Speech);
        assert_eq!(result.transition, Some(VadTransition::SpeechStarted));
    }

    #[test]
    fn test_speech_forwards_audio() {
        let config = VadConfig {
            min_voice_ms: FRAME_MS, // one frame starts speech
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // Trigger speech
        let _ = vad.process(&voiced_frame());

        // Subsequent frames should be forwarded
        let result = vad.process(&voiced_frame());
        assert_eq!(result.frames.len(), 1);
    }

    #[test]
    fn test_silence_after_speech() {
        // No hangover: one frame of end-silence, no grace → ends immediately
        // after the pause window, matching the old frame-count behaviour.
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            end_silence_ms: FRAME_MS,
            resume_grace_ms: 0,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // Start speech
        let _ = vad.process(&voiced_frame());
        assert_eq!(vad.state(), VadState::Speech);

        // First silent frame: reaches end_silence → enters the (zero) hangover.
        let result = vad.process(&silent_frame());
        assert_eq!(vad.state(), VadState::Trailing);
        assert!(result.transition.is_none());

        // Second silent frame: hangover is zero → finalize to Silence.
        let result = vad.process(&silent_frame());
        assert_eq!(vad.state(), VadState::Silence);
        assert_eq!(result.transition, Some(VadTransition::SpeechEnded));
        assert!(result.frames.is_empty()); // trailing silence not forwarded
    }

    #[test]
    fn test_pause_within_grace_continues_utterance() {
        // 100 ms end-silence + 300 ms grace → up to 400 ms of pause tolerated.
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            end_silence_ms: FRAME_MS,
            resume_grace_ms: 3 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // Start speech.
        let started = vad.process(&voiced_frame());
        assert_eq!(started.transition, Some(VadTransition::SpeechStarted));
        assert_eq!(vad.state(), VadState::Speech);

        // Pause: cross end_silence into the hangover, then stay a bit longer,
        // all within the grace window — no finalize, no new transition.
        assert!(vad.process(&silent_frame()).transition.is_none());
        assert_eq!(vad.state(), VadState::Trailing);
        assert!(vad.process(&silent_frame()).transition.is_none());
        assert_eq!(vad.state(), VadState::Trailing);

        // Speech resumes within the grace window: continue the SAME utterance.
        let resumed = vad.process(&voiced_frame());
        assert_eq!(vad.state(), VadState::Speech);
        assert!(
            resumed.transition.is_none(),
            "resume within grace must not emit SpeechStarted/SpeechEnded"
        );
        assert_eq!(resumed.frames.len(), 1);
    }

    #[test]
    fn test_pause_beyond_grace_ends_utterance() {
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            end_silence_ms: FRAME_MS,
            resume_grace_ms: 2 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        let _ = vad.process(&voiced_frame());
        assert_eq!(vad.state(), VadState::Speech);

        // Silence: 1 frame reaches end_silence (→ Trailing), then 2 frames of
        // grace elapse → finalize on the frame that crosses resume_grace_ms.
        assert!(vad.process(&silent_frame()).transition.is_none()); // → Trailing
        assert!(vad.process(&silent_frame()).transition.is_none()); // grace 100/200
        let ended = vad.process(&silent_frame()); // grace 200/200 → finalize
        assert_eq!(vad.state(), VadState::Silence);
        assert_eq!(ended.transition, Some(VadTransition::SpeechEnded));
    }

    #[test]
    fn test_max_utterance_force_flush() {
        // Never pauses; must force-flush at max_utterance_ms.
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            max_utterance_ms: 3 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // Frame 1 (100 ms): starts speech, utterance = 100 ms.
        assert_eq!(
            vad.process(&voiced_frame()).transition,
            Some(VadTransition::SpeechStarted)
        );
        // Frame 2: utterance = 200 ms, still speaking.
        assert!(vad.process(&voiced_frame()).transition.is_none());
        // Frame 3: utterance = 300 ms >= max → force flush.
        let ended = vad.process(&voiced_frame());
        assert_eq!(ended.transition, Some(VadTransition::SpeechEnded));
        assert_eq!(vad.state(), VadState::Silence);
    }

    #[test]
    fn test_pre_buffer_flushed_on_speech() {
        // Keep 200 ms (2 frames) of pre-speech audio.
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            pre_buffer_ms: 2 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        // Feed 2 silent frames (goes into pre-buffer)
        vad.process(&silent_frame());
        vad.process(&silent_frame());

        // Trigger speech — should flush pre-buffer + current = 3 frames
        let result = vad.process(&voiced_frame());
        assert_eq!(result.frames.len(), 3);
        assert_eq!(result.transition, Some(VadTransition::SpeechStarted));
    }

    #[test]
    fn test_pre_buffer_evicts_oldest_by_duration() {
        // Only 200 ms of pre-buffer; feed 4 silent frames, expect the oldest 2
        // evicted so only 2 pre-buffer frames + the current frame flush.
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            pre_buffer_ms: 2 * FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        for _ in 0..4 {
            vad.process(&silent_frame());
        }
        let result = vad.process(&voiced_frame());
        assert_eq!(result.frames.len(), 3); // 2 kept pre-buffer + current
    }

    #[test]
    fn test_reset() {
        let config = VadConfig {
            min_voice_ms: FRAME_MS,
            ..Default::default()
        };
        let mut vad = Vad::new(config);

        let _ = vad.process(&voiced_frame());
        assert_eq!(vad.state(), VadState::Speech);

        vad.reset();
        assert_eq!(vad.state(), VadState::Silence);
    }
}
