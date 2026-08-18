//! Quotation-likelihood scoring — telling spoken *scripture quotation*
//! (reading or reciting a verse) apart from *regular preaching* that merely
//! talks about, or loosely alludes to, scripture.
//!
//! # Why this exists
//!
//! Speech-to-text (Moonshine / Deepgram) only produces words; it cannot label
//! discourse. The semantic detector then matches those words against the verse
//! index by meaning — and we *want* both cases to surface: a preacher who
//! *quotes* John 3:16 and one who *preaches about* it (paraphrasing, expounding)
//! should each get the verse on screen. This module supplies an independent,
//! transcript-derived signal for "how quotation-like is this utterance", used to
//! **boost** semantic confidence when scripture markers are present — so genuine
//! quotations rank above loose allusions and clear the auto-queue threshold more
//! readily — while leaving preaching that merely alludes to a verse at its raw
//! semantic-match confidence rather than penalizing it.
//!
//! It is deliberately a *lift*, never a penalty: the effect on a signal-free
//! utterance is exactly zero (factor `1.0`), so preaching about a verse surfaces
//! on its own merit; a fully quotation-like utterance is lifted by at most
//! [`QUOTE_BOOST`]. Direct spoken references ("John three sixteen") are already
//! citations and must not be routed through here.
//!
//! # Signals (each in `[0, 1]`, combined by noisy-OR)
//!
//! - **Archaic register** — density of KJV-register markers (`thee`, `thou`,
//!   `saith`, `-eth` verbs…). Verbatim KJV text spikes here; modern preaching
//!   does not. Ambiguous words that also occur in ordinary speech (`art`,
//!   `will`, superlatives) are intentionally excluded.
//! - **Citation cues** — lead-in phrases that announce a quotation ("it is
//!   written", "the Bible says", "turn to", "thus saith the Lord"). Weighted by
//!   strength; the strongest matched cue wins.
//! - **Verbatim overlap** — trigram containment of the candidate verse text in
//!   the transcript. Only available to callers that have resolved a candidate
//!   verse (e.g. the live semantic worker); it is the strongest signal when
//!   present. Pass `None` when no candidate text is on hand.

use std::collections::HashSet;

/// KJV-register marker words. Presence signals the speaker is reading/quoting
/// scripture rather than preaching in modern English. Kept unambiguous on
/// purpose — words like "art", "will", or superlatives that also appear in
/// everyday speech are excluded to avoid false positives.
///
/// The `-eth`/`-est` verb forms are listed explicitly rather than matched by
/// suffix: a generic "ends in -eth" rule would wrongly flag ordinary words
/// (`teeth`) and, worse, biblical proper nouns a preacher says in normal speech
/// (`Nazareth`, `Elizabeth`, `Japheth`), inflating the archaic score during
/// plain preaching. An explicit list has no such false positives.
const ARCHAIC_WORDS: &[&str] = &[
    // Pronouns / particles / interjections.
    "thee", "thou", "thy", "thine", "ye", "unto", "verily", "yea", "behold",
    "nigh", "thence", "hither", "thither", "wherefore", "whosoever", "henceforth",
    "thereof", "thereunto", "wherewith", "brethren", "begat", "begotten", "spake",
    // Auxiliary / modal archaic forms.
    "hath", "hast", "doth", "dost", "shalt", "wilt", "saith", "sayeth",
    // Common `-eth` third-person verb forms.
    "believeth", "cometh", "goeth", "doeth", "walketh", "loveth", "giveth",
    "maketh", "taketh", "sitteth", "standeth", "knoweth", "seeketh", "keepeth",
    "dwelleth", "liveth", "reigneth", "worketh", "speaketh", "heareth", "calleth",
    "leadeth", "feareth", "trusteth", "abideth", "endureth", "sinneth", "judgeth",
    // Common `-est` second-person verb forms.
    "believest", "comest", "doest", "knowest", "lovest", "seest", "sayest",
];

/// Number of archaic markers at which the archaic sub-score saturates to 1.0.
/// Two independent markers ("thou", "saith") is already a strong signal.
const ARCHAIC_SATURATION: f64 = 2.0;

/// Strongest citation cues — phrases that almost always announce a direct quote.
const STRONG_CUES: &[&str] = &[
    "it is written",
    "as it is written",
    "thus saith the lord",
    "the bible says",
    "bible says",
    "the scripture says",
    "scripture says",
    "the scriptures say",
    "the word of god says",
    "word of god says",
    "gods word says",
    "hear the word of the lord",
    "the good book says",
];

/// Medium cues — commonly precede a quotation but also occur in narration.
const MEDIUM_CUES: &[&str] = &[
    "turn to",
    "turn with me to",
    "turn in your bibles",
    "let us read",
    "lets read",
    "reading from",
    "in the book of",
    "the psalmist says",
    "paul writes",
    "the passage says",
    "the text says",
];

/// Weak cues — attribution phrases that only loosely imply a quotation.
const WEAK_CUES: &[&str] = &["according to", "jesus said", "the lord said", "god said"];

/// Upper bound on the confidence *lift* applied to a fully quotation-like hit.
/// A signal-free semantic hit (preaching about a verse) keeps 100% of its
/// confidence; a fully quotation-like hit is scaled by `1 + QUOTE_BOOST`. This
/// is the recall/ranking knob — higher lets genuine quotations clear the
/// auto-queue threshold more easily and outrank loose allusions, without ever
/// suppressing preaching that alludes to a verse.
const QUOTE_BOOST: f64 = 0.25;

/// The transcript-only sub-signals, computed once per utterance and reusable
/// across every candidate verse (only [`verbatim_overlap`] varies per verse).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TextSignals {
    /// Archaic-register score in `[0, 1]`.
    pub archaic: f64,
    /// Citation-cue score in `[0, 1]`.
    pub cue: f64,
}

/// Tokenize into lowercase alphanumeric words, dropping punctuation.
fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_ascii_lowercase)
        .collect()
}

fn is_archaic(w: &str) -> bool {
    ARCHAIC_WORDS.contains(&w)
}

fn archaic_score(ws: &[String]) -> f64 {
    let count = ws.iter().filter(|w| is_archaic(w)).count();
    (count as f64 / ARCHAIC_SATURATION).min(1.0)
}

/// Match cues against a space-padded haystack so a cue only matches at a word
/// boundary (prevents "return to" from matching the cue "turn to").
fn cue_score(padded_hay: &str) -> f64 {
    let hits = |cues: &[&str]| cues.iter().any(|c| padded_hay.contains(&format!(" {c}")));
    if hits(STRONG_CUES) {
        1.0
    } else if hits(MEDIUM_CUES) {
        0.7
    } else if hits(WEAK_CUES) {
        0.4
    } else {
        0.0
    }
}

/// Combine independent probabilities by noisy-OR: `1 - ∏(1 - xᵢ)`. Any single
/// strong signal pushes the result high; multiple signals compound. Bounded to
/// `[0, 1]` for inputs in `[0, 1]`.
fn noisy_or(parts: &[f64]) -> f64 {
    let complement: f64 = parts.iter().map(|p| 1.0 - p.clamp(0.0, 1.0)).product();
    1.0 - complement
}

/// Word-level trigrams of a token slice, as "a b c" keys.
fn trigrams(ws: &[String]) -> HashSet<String> {
    ws.windows(3)
        .map(|t| format!("{} {} {}", t[0], t[1], t[2]))
        .collect()
}

fn verbatim_overlap_words(tx: &[String], verse: &[String]) -> f64 {
    if verse.is_empty() || tx.is_empty() {
        return 0.0;
    }
    // Short verses lack trigrams — fall back to unigram containment.
    if verse.len() < 3 {
        let set: HashSet<&String> = tx.iter().collect();
        let hits = verse.iter().filter(|w| set.contains(w)).count();
        return hits as f64 / verse.len() as f64;
    }
    let tx_tri = trigrams(tx);
    let verse_tri = trigrams(verse);
    if verse_tri.is_empty() {
        return 0.0;
    }
    let hits = verse_tri.iter().filter(|t| tx_tri.contains(*t)).count();
    hits as f64 / verse_tri.len() as f64
}

/// Compute the transcript-only sub-signals (archaic register + citation cues).
/// Cheap enough to call per candidate verse, but exposed separately so callers
/// with many candidates can compute it once.
pub fn text_signals(text: &str) -> TextSignals {
    let ws = words(text);
    if ws.is_empty() {
        return TextSignals {
            archaic: 0.0,
            cue: 0.0,
        };
    }
    let padded = format!(" {} ", ws.join(" "));
    TextSignals {
        archaic: archaic_score(&ws),
        cue: cue_score(&padded),
    }
}

/// Fraction of the candidate verse's trigrams that appear verbatim in the
/// transcript (unigram containment for verses shorter than a trigram). Near 1.0
/// for a verbatim reading, low for a paraphrase.
pub fn verbatim_overlap(transcript: &str, verse_text: &str) -> f64 {
    verbatim_overlap_words(&words(transcript), &words(verse_text))
}

/// Overall quotation likelihood in `[0, 1]` for `text`, optionally informed by
/// the resolved candidate `verse_text` (enables the verbatim-overlap signal).
pub fn quotation_score(text: &str, verse_text: Option<&str>) -> f64 {
    let ws = words(text);
    if ws.is_empty() {
        return 0.0;
    }
    let padded = format!(" {} ", ws.join(" "));
    let archaic = archaic_score(&ws);
    let cue = cue_score(&padded);
    let overlap = verse_text.map_or(0.0, |vt| verbatim_overlap_words(&ws, &words(vt)));
    noisy_or(&[archaic, cue, overlap])
}

/// Apply a quotation score as a recall/ranking lift on a semantic confidence.
/// Maps `quotation ∈ [0, 1]` to a factor in `[1, 1 + QUOTE_BOOST]` and scales
/// `confidence` by it, clamped to `[0, 1]`. A signal-free hit (preaching about a
/// verse) is left unchanged so it still surfaces on its own merit; a fully
/// quotation-like hit is lifted by up to `QUOTE_BOOST` so genuine quotations
/// rank higher and auto-queue more readily.
pub fn adjust_confidence(confidence: f64, quotation: f64) -> f64 {
    let q = quotation.clamp(0.0, 1.0);
    let factor = 1.0 + QUOTE_BOOST * q;
    (confidence * factor).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "expected {b}, got {a}");
    }

    #[test]
    fn empty_text_scores_zero() {
        approx(quotation_score("", None), 0.0);
        approx(quotation_score("   !!  ", None), 0.0);
        let s = text_signals("");
        approx(s.archaic, 0.0);
        approx(s.cue, 0.0);
    }

    #[test]
    fn modern_preaching_has_low_score() {
        // No archaic markers, no cues, no candidate text.
        let s = quotation_score(
            "so today I want to talk to you about how much God loves each one of us",
            None,
        );
        assert!(s < 0.2, "modern preaching should score low, got {s}");
    }

    #[test]
    fn archaic_verse_scores_high() {
        // Verbatim KJV John 3:16 register: "hath", "-eth", "begotten", "whosoever".
        let s = quotation_score(
            "For God so loved the world that whosoever believeth in him should not perish",
            None,
        );
        assert!(s > 0.5, "archaic register should score high, got {s}");
    }

    #[test]
    fn single_archaic_marker_is_half() {
        // One marker / saturation(2) = 0.5 archaic, no cue/overlap -> noisy-OR = 0.5.
        approx(quotation_score("he saith to the people", None), 0.5);
    }

    #[test]
    fn archaic_verbs_detected_without_proper_noun_false_positives() {
        assert!(is_archaic("believeth"));
        assert!(is_archaic("walketh"));
        assert!(is_archaic("saith"));
        assert!(is_archaic("thou"));
        // Ordinary word ending in -eth must NOT be archaic.
        assert!(!is_archaic("teeth"));
        // Biblical proper nouns ending in -eth must NOT count as archaic register
        // (a preacher naming them in modern speech should not look like a quote).
        assert!(!is_archaic("nazareth"));
        assert!(!is_archaic("elizabeth"));
        // Ordinary modern words are not archaic.
        assert!(!is_archaic("greatest"));
        assert!(!is_archaic("will"));
    }

    #[test]
    fn strong_cue_dominates() {
        approx(text_signals("it is written man shall not live by bread alone").cue, 1.0);
        approx(text_signals("the bible says we should love").cue, 1.0);
    }

    #[test]
    fn medium_and_weak_cues() {
        approx(text_signals("turn to the book of psalms").cue, 0.7);
        approx(text_signals("according to the gospel").cue, 0.4);
    }

    #[test]
    fn cue_requires_word_boundary() {
        // "return to" must NOT match the "turn to" cue.
        approx(text_signals("we will return to that point later").cue, 0.0);
    }

    #[test]
    fn verbatim_overlap_high_for_exact_quote() {
        let verse = "In the beginning God created the heaven and the earth";
        let transcript = "he read in the beginning God created the heaven and the earth to us";
        assert!(
            verbatim_overlap(transcript, verse) > 0.8,
            "exact quote should have high overlap"
        );
    }

    #[test]
    fn verbatim_overlap_low_for_paraphrase() {
        let verse = "In the beginning God created the heaven and the earth";
        let transcript = "at the start the Lord made the skies and the ground";
        assert!(
            verbatim_overlap(transcript, verse) < 0.2,
            "paraphrase should have low overlap"
        );
    }

    #[test]
    fn verbatim_overlap_short_verse_unigram_fallback() {
        // Fewer than 3 words -> unigram containment.
        approx(verbatim_overlap("jesus wept openly", "Jesus wept"), 1.0);
        approx(verbatim_overlap("nothing here", "Jesus wept"), 0.0);
    }

    #[test]
    fn overlap_lifts_score_when_verse_text_present() {
        let verse = "In the beginning God created the heaven and the earth";
        let plain = "in the beginning God created the heaven and the earth";
        // Same transcript scores higher when the candidate verse text confirms it.
        let without = quotation_score(plain, None);
        let with = quotation_score(plain, Some(verse));
        assert!(with > without);
        assert!(with > 0.8);
    }

    #[test]
    fn adjust_confidence_bounds() {
        // Zero quotation (preaching) -> unchanged, never penalized.
        approx(adjust_confidence(1.0, 0.0), 1.0);
        approx(adjust_confidence(0.6, 0.0), 0.6);
        // Full quotation -> lifted by QUOTE_BOOST.
        approx(adjust_confidence(0.5, 1.0), 0.5 * (1.0 + QUOTE_BOOST));
        // Monotonic in quotation score.
        assert!(adjust_confidence(0.7, 0.3) < adjust_confidence(0.7, 0.8));
        // Clamped to [0, 1] and quotation clamped to [0, 1].
        approx(adjust_confidence(0.9, 1.0), (0.9 * (1.0 + QUOTE_BOOST)).min(1.0));
        approx(adjust_confidence(0.5, 5.0), 0.5 * (1.0 + QUOTE_BOOST));
        approx(adjust_confidence(0.5, -5.0), 0.5);
    }

    #[test]
    fn noisy_or_properties() {
        approx(noisy_or(&[0.0, 0.0, 0.0]), 0.0);
        approx(noisy_or(&[1.0, 0.0]), 1.0);
        approx(noisy_or(&[0.5, 0.5]), 0.75);
    }

    #[test]
    fn quote_outranks_preaching_without_penalizing_preaching() {
        // A vague-match preaching line and a verbatim quote can arrive with the
        // same raw cosine. The quotation lift must rank the quote higher *without*
        // dropping the preaching line below its raw confidence — a pastor
        // preaching about a verse should still surface it.
        let raw = 0.62;
        let preaching = adjust_confidence(
            raw,
            quotation_score("God really loves all the people of the world", None),
        );
        let quote = adjust_confidence(
            raw,
            quotation_score(
                "for God so loved the world that he gave his only begotten Son",
                None,
            ),
        );
        assert!(quote > preaching);
        // Preaching is never penalized below its raw semantic confidence.
        assert!(preaching >= raw);
    }
}
