//! Archaic → modern English normalization for KJV verse matching.
//!
//! ## Why this exists
//!
//! The offline STT (Moonshine) is trained on modern vocabulary, so when a
//! pastor reads archaic KJV wording aloud ("thou shalt not… saith the Lord")
//! the transcript drifts toward modern forms ("you shall not… says the Lord")
//! — and, worse, drifts *inconsistently* (sometimes "thou", sometimes "you").
//! Meanwhile the pre-computed verse index is embedded from the archaic KJV
//! text. That is a *lexical-space mismatch*: the transcript and the verse it
//! quotes land in slightly different regions of the embedding space, weakening
//! semantic detection.
//!
//! The fix (path A1) is to canonicalize **both sides** into one lexical space
//! *before* embedding: the verse text at index-build time and the live
//! transcript at query time. Whether Moonshine emits "thou" or "you", it
//! becomes "you", matching the normalized verse. We canonicalize toward the
//! *modern* form because it is the many-archaic-to-one-modern direction (the
//! reverse would be ambiguous).
//!
//! ## The lockstep contract
//!
//! Query-side normalization (here) and document-side normalization
//! (`data/compute-embeddings.ts`, which writes `verses-for-embedding.json`)
//! MUST produce the same canonical tokens, or the two sides diverge and this
//! *hurts* matching. They stay in lockstep by consuming the **same** rule
//! table — [`archaic-normalization.json`](./archaic-normalization.json) — and
//! applying the same whole-word, case-insensitive replacement. Because the
//! table is baked into the binary via `include_str!`, there is no runtime file
//! dependency; changing it requires a recompile *and* an index rebuild
//! (`npm run export:verses && npm run precompute:embeddings`).

use std::collections::HashMap;
use std::sync::OnceLock;

/// The canonical rule table, compiled into the binary. See the module doc for
/// the lockstep contract with the document-side generator.
const RULES_JSON: &str = include_str!("archaic-normalization.json");

/// Parse and cache the word map on first use. The table is tiny (~70 entries)
/// so a single lazy parse is cheaper than any codegen alternative.
fn word_map() -> &'static HashMap<String, String> {
    static MAP: OnceLock<HashMap<String, String>> = OnceLock::new();
    MAP.get_or_init(|| {
        #[derive(serde::Deserialize)]
        struct Rules {
            #[serde(rename = "wordMap")]
            word_map: HashMap<String, String>,
        }
        let rules: Rules = serde_json::from_str(RULES_JSON)
            .expect("archaic-normalization.json must be valid JSON with a wordMap");
        rules.word_map
    })
}

/// Canonicalize archaic KJV vocabulary in `text` to modern equivalents.
///
/// Each maximal run of ASCII-alphabetic characters is treated as a word:
/// looked up in the rule table (case-insensitively) and replaced with the
/// modern form when a rule matches, or lowercased otherwise. Case is *always*
/// folded to lowercase because it is itself a mismatch axis — a KJV verse is
/// always capitalized sentence-initially while the STT casing is inconsistent —
/// and folding both sides identically removes it. All non-alphabetic characters
/// (spaces, punctuation, digits) pass through unchanged, so word boundaries and
/// layout are preserved.
///
/// This word-boundary-preserving pass is deliberately identical in shape to
/// the `String.replace(/[A-Za-z]+/g, …)` used on the document side, so the two
/// sides converge (see the module-level lockstep contract).
///
/// The function is idempotent: modern replacements are never themselves rule
/// keys, so `normalize_archaic(normalize_archaic(x)) == normalize_archaic(x)`.
pub fn normalize_archaic(text: &str) -> String {
    let map = word_map();
    let mut out = String::with_capacity(text.len());
    let mut word = String::new();

    for ch in text.chars() {
        if ch.is_ascii_alphabetic() {
            word.push(ch);
        } else {
            flush_word(&mut word, map, &mut out);
            out.push(ch);
        }
    }
    flush_word(&mut word, map, &mut out);

    out
}

/// Emit the accumulated word — replaced if it matches a rule, verbatim
/// otherwise — then clear the buffer.
fn flush_word(word: &mut String, map: &HashMap<String, String>, out: &mut String) {
    if word.is_empty() {
        return;
    }
    let lower = word.to_ascii_lowercase();
    match map.get(&lower) {
        Some(replacement) => out.push_str(replacement),
        None => out.push_str(&lower),
    }
    word.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_table_parses() {
        // Forces the lazy parse; panics if the JSON is malformed.
        assert!(!word_map().is_empty());
    }

    #[test]
    fn replaces_pronouns_and_conjugations() {
        assert_eq!(
            normalize_archaic("thou shalt not kill"),
            "you shall not kill"
        );
        assert_eq!(normalize_archaic("thy word is truth"), "your word is truth");
    }

    #[test]
    fn folds_non_archaic_text_to_lowercase() {
        // Non-rule words pass through but are lowercased so case never becomes a
        // mismatch axis between verse and transcript.
        assert_eq!(
            normalize_archaic("For God so loved the world"),
            "for god so loved the world"
        );
    }

    #[test]
    fn preserves_punctuation_and_layout() {
        assert_eq!(
            normalize_archaic("Thou art holy; thou hast spoken."),
            "you are holy; you have spoken."
        );
    }

    #[test]
    fn case_is_folded_for_rule_and_non_rule_words() {
        assert_eq!(normalize_archaic("SAITH the LORD"), "says the lord");
    }

    #[test]
    fn is_idempotent() {
        let once = normalize_archaic("verily I say unto thee, thou believeth");
        let twice = normalize_archaic(&once);
        assert_eq!(once, twice);
    }

    /// The whole point of path A1: an archaic verse and its modern
    /// mis-transcription must converge to the same canonical string so their
    /// embeddings land together.
    #[test]
    fn archaic_and_modern_forms_converge() {
        let verse = normalize_archaic("Thou shalt love thy neighbour as thyself");
        let transcript = normalize_archaic("You shall love your neighbour as thyself");
        assert_eq!(verse, transcript);

        let verse2 = normalize_archaic("he that believeth on the Son hath everlasting life");
        let transcript2 = normalize_archaic("he that believes on the Son has everlasting life");
        assert_eq!(verse2, transcript2);
    }

    #[test]
    fn handles_empty_and_symbol_only() {
        assert_eq!(normalize_archaic(""), "");
        assert_eq!(normalize_archaic("  ,;:  "), "  ,;:  ");
    }
}
