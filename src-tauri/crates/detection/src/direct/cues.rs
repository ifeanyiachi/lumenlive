//! Citation-cue detection for the narrative guard (aitrans Phase 3).
//!
//! A book name in a sermon can arrive two ways: the speaker *turning to* a
//! reference ("turn to Obadiah", "the book of Romans") or merely *naming* it in
//! prose ("and Ahab said to Obadiah"). Only the first is a deliberate citation.
//! The narrative guard uses this distinction to decide whether an auto-display
//! is trustworthy while Reading Mode is tracking a *different* book.
//!
//! The test is deliberately **positional**: a cue counts only when it sits
//! immediately before the book name, within a short window. A bare "look at" or
//! "verse" elsewhere in the sentence must NOT count — the Obadiah incident was
//! literally "Look at verse 6, and and Ahab said to Obadiah, go", where those
//! words appear but do not introduce the book.
//!
//! Detection runs on the **raw** transcript, not the cleaned one:
//! `clean_transcript` strips several of the strongest cues ("the book of",
//! "look at <Book>"), so matching after cleaning would miss exactly the phrases
//! that prove a citation.

/// Cue phrases that INTRODUCE a book name. Matched only immediately before the
/// book, so prose that merely contains one of these words elsewhere does not
/// count. Kept lowercase; the haystack is lowercased before matching.
const INTRO_CUES: &[&str] = &[
    "turn to",
    "turn with me to",
    "turn with me",
    "go to",
    "goto",
    "open to",
    "open your bible to",
    "open your bibles to",
    "open our bible to",
    "open our bibles to",
    "book of",
    "reading from",
    "read from",
    "reading in",
    "over in",
    "found in",
    "look at",
    "look in",
    "back to",
    "we read in",
    "we're in",
    "were in",
    "bible says in",
    "it says in",
    "as written in",
    "as we see in",
    "let us turn to",
    "let's turn to",
    "lets turn to",
];

/// How many characters before the book name to inspect for a cue. Comfortably
/// covers the longest cue phrase plus a little slack for whitespace.
const CUE_WINDOW_CHARS: usize = 48;

/// Returns true when an explicit citation cue immediately precedes any spoken
/// occurrence of `book_name` in `text`.
///
/// `text` is the **raw** transcript; `book_name` is the canonical book name from
/// the detection (e.g. "Obadiah", "1 Corinthians"). When the spoken form differs
/// from the canonical name (a fuzzy/abbreviated hit that never appears verbatim),
/// this simply returns false — the safe direction, since an uncertain cue should
/// not grant extra display trust.
pub fn cue_precedes_book_name(text: &str, book_name: &str) -> bool {
    if book_name.is_empty() {
        return false;
    }
    let haystack = text.to_lowercase();
    let needle = book_name.to_lowercase();

    let mut search_from = 0;
    while let Some(rel) = haystack[search_from..].find(&needle) {
        let book_start = search_from + rel;
        if cue_in_window(&haystack, book_start) {
            return true;
        }
        // Advance past this occurrence and keep looking.
        search_from = book_start + needle.len();
        if search_from >= haystack.len() {
            break;
        }
    }
    false
}

/// Check whether the window of text immediately before `book_start` (already a
/// char boundary into a lowercased string) ends with a cue phrase.
fn cue_in_window(haystack: &str, book_start: usize) -> bool {
    if book_start == 0 {
        return false;
    }
    let mut win_start = book_start.saturating_sub(CUE_WINDOW_CHARS);
    while win_start < book_start && !haystack.is_char_boundary(win_start) {
        win_start += 1;
    }
    // Trim trailing whitespace/punctuation between the cue and the book name.
    let window = haystack[win_start..book_start].trim_end_matches(|c: char| !c.is_alphanumeric());
    INTRO_CUES.iter().any(|cue| window.ends_with(*cue))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cue_directly_before_book() {
        assert!(cue_precedes_book_name("let's turn to Obadiah verse 6", "Obadiah"));
        assert!(cue_precedes_book_name("turn to Romans chapter 8", "Romans"));
        assert!(cue_precedes_book_name("the book of Genesis begins", "Genesis"));
        assert!(cue_precedes_book_name("look at John three sixteen", "John"));
    }

    #[test]
    fn no_cue_in_narrative_prose() {
        // The Obadiah incident: cue words present but NOT introducing the book.
        assert!(!cue_precedes_book_name(
            "Look at verse 6, and and Ahab said to Obadiah, go",
            "Obadiah"
        ));
        assert!(!cue_precedes_book_name("and Ahab said to Obadiah", "Obadiah"));
        assert!(!cue_precedes_book_name("Elijah spoke to James and John", "James"));
    }

    #[test]
    fn book_at_start_has_no_cue() {
        assert!(!cue_precedes_book_name("Obadiah 1:6 says", "Obadiah"));
    }

    #[test]
    fn missing_book_name_is_safe_false() {
        assert!(!cue_precedes_book_name("turn to the next slide", "Obadiah"));
        assert!(!cue_precedes_book_name("", "John"));
    }

    #[test]
    fn case_insensitive() {
        assert!(cue_precedes_book_name("TURN TO ISAIAH", "Isaiah"));
    }
}
