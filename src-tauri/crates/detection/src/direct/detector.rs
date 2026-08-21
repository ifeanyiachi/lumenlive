use std::collections::VecDeque;
use std::sync::OnceLock;
use std::time::Instant;

use regex::Regex;

use super::automaton::{BookMatch, BookMatcher};
use super::context::ReferenceContext;
use super::fuzzy;
use super::parser;
use crate::types::{Detection, VerseRef};

/// Translation command patterns — maps spoken phrases to translation abbreviations.
const TRANSLATION_COMMANDS: &[(&str, &str)] = &[
    // KJV
    ("give me kjv", "KJV"),
    ("read in kjv", "KJV"),
    ("switch to kjv", "KJV"),
    ("in the kjv", "KJV"),
    ("can i have it in kjv", "KJV"),
    ("can i have that in kjv", "KJV"),
    ("show me kjv", "KJV"),
    ("king james version", "KJV"),
    ("king james", "KJV"),
    ("in king james", "KJV"),
    // SpaRV (Spanish - Reina-Valera 1909)
    ("give me reina valera", "SpaRV"),
    ("read in reina valera", "SpaRV"),
    ("switch to reina valera", "SpaRV"),
    ("in reina valera", "SpaRV"),
    ("can i have it in reina valera", "SpaRV"),
    ("can i have that in reina valera", "SpaRV"),
    ("show me reina valera", "SpaRV"),
    ("give me spanish", "SpaRV"),
    ("read in spanish", "SpaRV"),
    ("switch to spanish", "SpaRV"),
    ("in spanish", "SpaRV"),
    ("can i have it in spanish", "SpaRV"),
    ("can i have that in spanish", "SpaRV"),
    ("spanish version", "SpaRV"),
    ("spanish translation", "SpaRV"),
    // FreJND (French - J.N. Darby)
    ("give me french", "FreJND"),
    ("read in french", "FreJND"),
    ("switch to french", "FreJND"),
    ("in french", "FreJND"),
    ("can i have it in french", "FreJND"),
    ("can i have that in french", "FreJND"),
    ("show me french", "FreJND"),
    ("french version", "FreJND"),
    ("french translation", "FreJND"),
    ("darby french", "FreJND"),
    // PorBLivre (Portuguese - Biblia Livre)
    ("give me portuguese", "PorBLivre"),
    ("read in portuguese", "PorBLivre"),
    ("switch to portuguese", "PorBLivre"),
    ("in portuguese", "PorBLivre"),
    ("can i have it in portuguese", "PorBLivre"),
    ("can i have that in portuguese", "PorBLivre"),
    ("show me portuguese", "PorBLivre"),
    ("portuguese version", "PorBLivre"),
    ("portuguese translation", "PorBLivre"),
    ("biblia livre", "PorBLivre"),
];

/// Maximum chapter count per book (`book_number` 1-66).
/// Used to reject impossible references like "Mark 30:1" (Mark has 16 chapters).
const MAX_CHAPTERS: [i32; 67] = [
    0,  // index 0 unused
    50, // 1  Genesis
    40, // 2  Exodus
    27, // 3  Leviticus
    36, // 4  Numbers
    34, // 5  Deuteronomy
    24, // 6  Joshua
    21, // 7  Judges
    4,  // 8  Ruth
    31, // 9  1 Samuel
    24, // 10 2 Samuel
    22, // 11 1 Kings
    25, // 12 2 Kings
    29, // 13 1 Chronicles
    36, // 14 2 Chronicles
    10, // 15 Ezra
    13, // 16 Nehemiah
    10, // 17 Esther
    42, // 18 Job
    150,// 19 Psalms
    31, // 20 Proverbs
    12, // 21 Ecclesiastes
    8,  // 22 Song of Solomon
    66, // 23 Isaiah
    52, // 24 Jeremiah
    5,  // 25 Lamentations
    48, // 26 Ezekiel
    12, // 27 Daniel
    14, // 28 Hosea
    3,  // 29 Joel
    9,  // 30 Amos
    1,  // 31 Obadiah
    4,  // 32 Jonah
    7,  // 33 Micah
    3,  // 34 Nahum
    3,  // 35 Habakkuk
    3,  // 36 Zephaniah
    2,  // 37 Haggai
    14, // 38 Zechariah
    4,  // 39 Malachi
    28, // 40 Matthew
    16, // 41 Mark
    24, // 42 Luke
    21, // 43 John
    28, // 44 Acts
    16, // 45 Romans
    16, // 46 1 Corinthians
    13, // 47 2 Corinthians
    6,  // 48 Galatians
    6,  // 49 Ephesians
    4,  // 50 Philippians
    4,  // 51 Colossians
    5,  // 52 1 Thessalonians
    3,  // 53 2 Thessalonians
    6,  // 54 1 Timothy
    4,  // 55 2 Timothy
    3,  // 56 Titus
    1,  // 57 Philemon
    13, // 58 Hebrews
    5,  // 59 James
    5,  // 60 1 Peter
    3,  // 61 2 Peter
    5,  // 62 1 John
    1,  // 63 2 John
    1,  // 64 3 John
    1,  // 65 Jude
    22, // 66 Revelation
];

/// Check if a book/chapter combination is valid.
fn is_valid_reference(book_number: i32, chapter: i32) -> bool {
    if !(1..=66).contains(&book_number) {
        return false;
    }
    #[expect(clippy::cast_sign_loss, reason = "book_number validated to be 1..=66")]
    let max_ch = MAX_CHAPTERS[book_number as usize];
    chapter >= 1 && chapter <= max_ch
}

/// Filler phrases commonly found in sermon transcripts that confuse detection.
/// These are stripped (case-insensitively) before the text reaches the automaton.
const FILLER_PHRASES: &[&str] = &[
    "please open your bibles to",
    "let us turn to",
    "let's turn to",
    "go to the book of",
    "the book of",
    "book of",
    "if you turn to",
    "if you'll turn to",
    "we will be reading from",
    "we read in",
    "the bible says in",
    "it says in",
    "as we see in",
    "as written in",
    "let's go to",
    "turn in your bibles to",
    "turn in your bible to",
];

/// Collapse sequences of space-separated single digits into a single number.
/// Handles STT output where "Psalm 119" is transcribed as "Psalm 1 1 9".
///
/// Only collapses runs of **3 or more** isolated single digits. A run of exactly
/// two single digits after a book (e.g. "Matthew 1 1", "John 3 1") is left alone:
/// spoken chapter+verse ("Matthew one one" → 1:1) is far more common than a
/// two-digit number dictated one digit at a time ("thirteen" → "1 3"), and the
/// two-number parser (`try_two_numbers`) resolves "Matthew 1 1" → Matthew 1:1.
/// Runs of 3+ ("1 1 9") are almost always a single multi-digit number split by
/// the transcriber, so those still collapse ("Psalm 1 1 9" → "Psalm 119").
fn collapse_spaced_digits(text: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\b(\d(?:\s+\d){2,})\b").unwrap());
    re.replace_all(text, |caps: &regex::Captures| {
        caps[1].chars().filter(|c| !c.is_whitespace()).collect::<String>()
    })
    .into_owned()
}

/// Strip common sermon filler phrases from transcript text so they do not
/// confuse the Aho-Corasick automaton or the parser.
///
/// Performs simple case-insensitive removal of each phrase in [`FILLER_PHRASES`],
/// plus a special pattern for "look at" when followed by what looks like a book name
/// (starts with an uppercase letter).
fn clean_transcript(text: &str) -> String {
    let mut result = collapse_spaced_digits(text);

    // Remove fixed filler phrases (case-insensitive)
    for phrase in FILLER_PHRASES {
        loop {
            let lower = result.to_lowercase();
            if let Some(pos) = lower.find(phrase) {
                result = format!("{}{}", &result[..pos], &result[pos + phrase.len()..]);
            } else {
                break;
            }
        }
    }

    // Handle "look at" only when followed by a word starting with an uppercase letter
    // (heuristic for a book name).
    loop {
        let lower = result.to_lowercase();
        if let Some(pos) = lower.find("look at") {
            let after_pos = pos + "look at".len();
            let after = &result[after_pos..];
            let trimmed = after.trim_start();
            if let Some(ch) = trimmed.chars().next() {
                if ch.is_ascii_uppercase() {
                    // Remove "look at" (keep the rest including the book name)
                    result = format!("{}{}", &result[..pos], &result[after_pos..]);
                    continue;
                }
            }
            break; // "look at" not followed by uppercase — leave it
        }
        break;
    }

    // Collapse multiple spaces and trim
    let mut prev_space = false;
    let collapsed: String = result
        .chars()
        .filter(|&c| {
            if c == ' ' {
                if prev_space {
                    return false;
                }
                prev_space = true;
            } else {
                prev_space = false;
            }
            true
        })
        .collect();

    collapsed.trim().to_string()
}

/// How long to wait for an incomplete reference to be completed (15 seconds).
/// Preachers often pause between book name and chapter/verse.
const INCOMPLETE_REF_TIMEOUT_MS: u128 = 15_000;

/// An incomplete reference waiting for verse completion.
#[derive(Debug, Clone)]
struct IncompleteRef {
    verse_ref: VerseRef,
    timestamp: Instant,
    /// When true, the chapter field is a default (1), not explicitly spoken.
    /// Bare numbers should be interpreted as chapter, not verse.
    chapter_is_default: bool,
}

/// Main orchestrator for direct Bible reference detection.
///
/// Uses Aho-Corasick automaton for fast book name matching, then parses
/// chapter:verse patterns (both numeric and spoken forms) and maintains
/// context for resolving partial references.
///
/// Supports incomplete reference handling: when a chapter-only reference
/// is detected (e.g., "Genesis 3"), it's held for up to 5 seconds waiting
/// for a verse completion (e.g., "verse 16"). If no completion arrives,
/// the chapter-only reference is emitted defaulting to verse 1.
/// Phrases that indicate the user wants to **re-show the current verse** (not
/// step to an adjacent one). These re-emit the most recent detection unchanged.
/// Stepping forward/backward is handled by [`DirectDetector::detect_navigation_command`]
/// (see [`NAV_FORWARD_PHRASES`] / [`NAV_BACKWARD_PHRASES`]).
const PREVIOUS_VERSE_PHRASES: &[&str] = &[
    "last verse",
    "that verse again",
    "go back to that verse",
    "back to that verse",
    "the same verse",
    "repeat that verse",
];

/// Maximum word count for an utterance to be treated as a navigation command.
/// Above this it is prose that merely mentions a verse, not an instruction to
/// advance the screen (dominance guard).
const MAX_NAV_WORDS: usize = 7;

/// Direction of a spoken navigation command. The verse to step *from* is the
/// frontend's live selection, so this carries only which way to move.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavDirection {
    /// Advance to the following verse.
    Next,
    /// Step back to the preceding verse.
    Previous,
}

/// Phrases meaning "advance to the next verse" (step +1 from the current verse).
const NAV_FORWARD_PHRASES: &[&str] = &[
    "next verse",
    "next one",
    "following verse",
    "the verse after",
    "read on",
    "keep reading",
    "move on to the next",
    "go on to the next",
    "on to the next",
];

/// Phrases meaning "go back to the preceding verse" (step -1 from the current verse).
const NAV_BACKWARD_PHRASES: &[&str] = &[
    "previous verse",
    "verse before",
    "one verse back",
    "back one verse",
    "back a verse",
    "go back one",
    "go back a verse",
    "step back",
];

/// A spoken command that changes which verse is on the program screen.
///
/// Two intents, both resolved *frontend-side* against the live selection (the
/// same contract as [`NavDirection`] — the command carries intent, never a
/// resolved verse):
/// - [`VerseCommand::Relative`] — step `count` verses in `direction` ("next
///   verse", "skip the next two verses", "go back one verse").
/// - [`VerseCommand::Absolute`] — jump to verse `verse` of the current chapter.
///   Ordinal and cardinal phrasings collapse here: "the third verse", "verse
///   three", and "verse 3" all yield `Absolute { verse: 3 }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerseCommand {
    /// Step relative to the verse currently on screen.
    Relative {
        /// Which way to step.
        direction: NavDirection,
        /// How many verses to move (1 for a plain "next verse").
        count: u32,
    },
    /// Jump to an absolute verse number within the current chapter.
    Absolute {
        /// The 1-based verse number to show.
        verse: u32,
    },
}

/// Upper bound on a spoken relative step. A believable "skip the next N verses"
/// is small; a larger number parsed out of an utterance is almost certainly a
/// mishearing, so it is clamped away rather than trusted.
const MAX_RELATIVE_STEP: i32 = 50;

/// Whitespace-delimited whole-word membership test (so "back" does not match
/// inside "background"). Trims surrounding punctuation from each word.
fn contains_word(text: &str, word: &str) -> bool {
    text.split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
        .any(|w| w == word)
}

pub struct DirectDetector {
    matcher: BookMatcher,
    context: ReferenceContext,
    /// Pending incomplete reference waiting for verse completion.
    incomplete: Option<IncompleteRef>,
    /// Recently detected verses for "previous verse" navigation (most recent first).
    recent_detections: VecDeque<VerseRef>,
}

impl DirectDetector {
    pub fn new() -> Self {
        DirectDetector {
            matcher: BookMatcher::new(),
            context: ReferenceContext::new(),
            incomplete: None,
            recent_detections: VecDeque::with_capacity(5),
        }
    }

    /// Recent detections for context tracking.
    pub fn recent_detections(&self) -> &VecDeque<VerseRef> {
        &self.recent_detections
    }

    /// Check if the transcript contains a translation switching command.
    /// Returns the translation abbreviation if found (e.g., "KJV", "`SpaRV`").
    ///
    /// Matches both full phrases ("king james version") and bare
    /// abbreviations ("KJV") as standalone words.
    pub fn detect_translation_command(&self, text: &str) -> Option<String> {
        let lower = text.to_lowercase();

        // First check full phrases (higher confidence)
        for (pattern, abbrev) in TRANSLATION_COMMANDS {
            if lower.contains(pattern) {
                log::info!("[DET-DIRECT] Translation command detected: {abbrev}");
                return Some(abbrev.to_string());
            }
        }

        // Then check bare abbreviations as standalone words
        // Split into words and check each against known abbreviations
        let words: Vec<&str> = lower.split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()))
            .collect();

        for word in &words {
            let matched = match *word {
                "kjv" => Some("KJV"),
                "sparv" | "spanish" => Some("SpaRV"),
                "frejnd" | "french" => Some("FreJND"),
                "porblivre" | "portuguese" => Some("PorBLivre"),
                _ => None,
            };
            if let Some(abbrev) = matched {
                log::info!("[DET-DIRECT] Translation abbreviation detected: {abbrev}");
                return Some(abbrev.to_string());
            }
        }

        None
    }

    /// Classify a spoken *navigation* command — "turn to the next verse", "go
    /// back one verse" — into a direction to step.
    ///
    /// This is deliberately a pure text classifier: it returns only the
    /// direction, NOT a target verse. The *anchor* — the verse to step from — is
    /// owned by the frontend, which knows the verse currently on the program
    /// screen regardless of how it got there (spoken reference, manual book-panel
    /// selection, queue take, reading mode). Resolving the target here against
    /// the last *detected* verse would ignore all of those non-voice paths, so
    /// the step (and chapter-boundary roll-over) is done frontend-side against
    /// the live selection instead.
    ///
    /// Returns `None` when the utterance is too long to be a bare command
    /// (guards against "...and in the next verse Paul says..."), or when a book
    /// name is present (that's a real reference — let [`Self::detect`] own it).
    pub fn detect_navigation_command(&self, text: &str) -> Option<NavDirection> {
        let cleaned = clean_transcript(text);
        let lower = cleaned.to_lowercase();

        // Dominance guard: a navigation command is a short, standalone utterance.
        // A long sentence that merely contains "the next verse" is preaching, not
        // a command to advance the audience screen.
        if lower.split_whitespace().count() > MAX_NAV_WORDS {
            return None;
        }

        // If an explicit book reference is present, this is a real reference —
        // let the main detector own it rather than treating it as navigation.
        if !self.matcher.find_books(&cleaned).is_empty() {
            return None;
        }

        if NAV_FORWARD_PHRASES.iter().any(|p| lower.contains(p)) {
            return Some(NavDirection::Next);
        }
        if NAV_BACKWARD_PHRASES.iter().any(|p| lower.contains(p)) {
            return Some(NavDirection::Previous);
        }
        None
    }

    /// Classify a spoken *verse* command — a relative step ("skip the next two
    /// verses") or an absolute jump ("go to the third verse", "verse 5") — into
    /// a [`VerseCommand`].
    ///
    /// Like [`Self::detect_navigation_command`], this returns *intent only*: the
    /// verse to act on is resolved frontend-side against the live selection, so
    /// the command works no matter how the current verse reached the screen. It
    /// supersedes the direction-only classifier (a plain "next verse" comes back
    /// as `Relative { count: 1 }`); the older one is kept for the existing
    /// `nav_command` path until the frontend migrates.
    ///
    /// Returns `None` when the utterance is too long to be a bare command
    /// (dominance guard), contains a real book reference (that's a jump the main
    /// detector owns), or mentions a chapter (chapter navigation belongs to
    /// reading mode).
    pub fn detect_verse_command(&self, text: &str) -> Option<VerseCommand> {
        let cleaned = clean_transcript(text);
        let lower = cleaned.to_lowercase();

        // Dominance guard: a command is a short, standalone utterance, not a
        // sentence of preaching that happens to name a verse.
        if lower.split_whitespace().count() > MAX_NAV_WORDS {
            return None;
        }
        // A real book reference is a jump the main detector owns.
        if !self.matcher.find_books(&cleaned).is_empty() {
            return None;
        }
        // Chapter navigation is reading mode's lane, not ours.
        if contains_word(&lower, "chapter") {
            return None;
        }

        // --- Relative: a direction marker scoped to a verse. ---
        // The bare direction keywords ("next", "back") only count when the
        // utterance also mentions a verse, so unrelated speech doesn't step.
        let has_verse = contains_word(&lower, "verse") || contains_word(&lower, "verses");
        let forward = NAV_FORWARD_PHRASES.iter().any(|p| lower.contains(p))
            || (has_verse
                && ["next", "forward", "following", "ahead"]
                    .iter()
                    .any(|k| contains_word(&lower, k)));
        let backward = NAV_BACKWARD_PHRASES.iter().any(|p| lower.contains(p))
            || (has_verse
                && ["previous", "back", "before", "prior"]
                    .iter()
                    .any(|k| contains_word(&lower, k)));

        // Both directions named — refuse rather than guess wrong.
        if forward && backward {
            return None;
        }
        if forward || backward {
            let direction = if forward {
                NavDirection::Next
            } else {
                NavDirection::Previous
            };
            let count = parser::first_number(&lower)
                .filter(|n| (1..=MAX_RELATIVE_STEP).contains(n))
                .unwrap_or(1);
            #[allow(
                clippy::cast_sign_loss,
                reason = "count is filtered to 1..=MAX_RELATIVE_STEP, always positive"
            )]
            return Some(VerseCommand::Relative {
                direction,
                count: count as u32,
            });
        }

        // --- Absolute: "verse N" / "the Nth verse". ---
        if let Some(verse) = parser::find_verse_number(&lower) {
            #[allow(
                clippy::cast_sign_loss,
                reason = "find_verse_number returns 1..=176, always positive"
            )]
            return Some(VerseCommand::Absolute {
                verse: verse as u32,
            });
        }

        None
    }

    /// Detect Bible references in the given transcript text.
    ///
    /// Returns a list of Detection objects for each reference found.
    #[allow(
        clippy::too_many_lines,
        reason = "sequential detection pipeline (clean -> match -> resolve -> \
                  score) read top-to-bottom; splitting obscures the stages"
    )]
    pub fn detect(&mut self, text: &str) -> Vec<Detection> {
        // Step 0: Clean filler phrases from the transcript
        let cleaned = clean_transcript(text);
        let text = &cleaned;

        let mut detections = Vec::new();

        // Step 0b: Check for "previous verse" / "last verse" navigation commands
        if let Some(prev_detection) = self.check_previous_verse_command(text) {
            detections.push(prev_detection);
            return detections;
        }

        // Step 0c: Check if there's a pending incomplete reference.
        // Try to complete it with chapter/verse continuation, or expire on timeout.
        if let Some(ref incomplete) = self.incomplete.clone() {
            let elapsed = incomplete.timestamp.elapsed().as_millis();
            if elapsed > INCOMPLETE_REF_TIMEOUT_MS {
                // Timeout: clean up pending state (EDGE-02).
                self.incomplete = None;
            } else if let Some(cont) =
                parser::try_extract_continuation(text, incomplete.chapter_is_default)
            {
                match cont {
                    parser::Continuation::ChapterAndVerse(ch, v) => {
                        let mut completed = incomplete.verse_ref.clone();
                        completed.chapter = ch;
                        completed.verse_start = v;
                        if is_valid_reference(completed.book_number, completed.chapter) {
                            detections.push(self.make_direct_detection(
                                &completed,
                                compute_confidence(&completed, &completed),
                                text,
                                0,
                                text.len(),
                            ));
                            self.push_recent(&completed);
                            self.context.update(&completed);
                        }
                        self.incomplete = None;
                        return detections;
                    }
                    parser::Continuation::VerseOnly(v) => {
                        let mut completed = incomplete.verse_ref.clone();
                        completed.verse_start = v;
                        if is_valid_reference(completed.book_number, completed.chapter) {
                            detections.push(self.make_direct_detection(
                                &completed,
                                compute_confidence(&completed, &completed),
                                text,
                                0,
                                text.len(),
                            ));
                            self.push_recent(&completed);
                            self.context.update(&completed);
                        }
                        self.incomplete = None;
                        return detections;
                    }
                    parser::Continuation::ChapterOnly(ch) => {
                        // Update chapter, reset timeout, keep waiting for verse.
                        let mut updated = incomplete.verse_ref.clone();
                        updated.chapter = ch;
                        self.incomplete = Some(IncompleteRef {
                            verse_ref: updated.clone(),
                            timestamp: Instant::now(),
                            chapter_is_default: false,
                        });
                        self.context.update(&updated);
                        // Fall through to book matcher (text may also contain a new book)
                    }
                }
            }
        }

        // Step 1: Find all book name matches using Aho-Corasick
        let book_matches = self.matcher.find_books(text);

        // Step 1b: If the automaton found nothing, try fuzzy matching as fallback
        let fuzzy_matches: Vec<BookMatch>;
        let effective_matches: &[BookMatch] = if book_matches.is_empty() {
            fuzzy_matches = fuzzy::fuzzy_find_books(text)
                .into_iter()
                .map(|fm| BookMatch {
                    book_number: fm.book_number,
                    book_name: fm.book_name,
                    start: fm.start,
                    end: fm.end,
                })
                .collect();
            &fuzzy_matches
        } else {
            &book_matches
        };

        // Step 2 & 3: Parse references and resolve context
        for book_match in effective_matches {
            if let Some(verse_ref) = parser::parse_reference(text, book_match) {
                // Resolve any partial references using context
                let resolved = self.context.resolve(&verse_ref);

                // Skip if we couldn't resolve to a meaningful reference
                if resolved.book_number == 0 || resolved.chapter == 0 {
                    self.context.update(&verse_ref);
                    continue;
                }

                // Skip impossible references (e.g., "Mark 30:1" — Mark has 16 chapters)
                if resolved.chapter > 0 && !is_valid_reference(resolved.book_number, resolved.chapter) {
                    continue;
                }

                // Chapter-only: hold for refinement, don't emit yet.
                // The full reference (with verse) will arrive when the user
                // finishes speaking and will be emitted then.
                if resolved.verse_start == 0 {
                    // Detect if chapter was explicitly spoken or defaulted.
                    let after_book = text[book_match.end..].trim();
                    let has_explicit_chapter =
                        after_book.starts_with(|c: char| c.is_ascii_digit())
                            || after_book.to_lowercase().starts_with("chapter");
                    self.incomplete = Some(IncompleteRef {
                        verse_ref: resolved.clone(),
                        timestamp: Instant::now(),
                        chapter_is_default: !has_explicit_chapter,
                    });
                    self.context.update(&resolved);
                    continue;
                }

                // Full reference — also clear any pending incomplete
                self.incomplete = None;

                let confidence = compute_confidence(&resolved, &verse_ref);
                let snippet = extract_snippet(text, book_match.start, book_match.end);

                let detection = Detection::direct(resolved.clone(), confidence, snippet);

                // Track in recent detections for "previous verse" support
                self.push_recent(&resolved);

                detections.push(detection);
                self.context.update(&resolved);
            }
        }

        detections
    }

    /// Check if text contains a "previous verse" / "last verse" command.
    fn check_previous_verse_command(&self, text: &str) -> Option<Detection> {
        let lower = text.to_lowercase();
        for phrase in PREVIOUS_VERSE_PHRASES {
            if lower.contains(phrase) {
                if let Some(prev_ref) = self.recent_detections.front() {
                    return Some(Detection::direct(prev_ref.clone(), 0.92, text.to_string()));
                }
            }
        }
        None
    }

    /// Push a verse ref to the recent detections queue (max 5).
    fn push_recent(&mut self, verse_ref: &VerseRef) {
        // Don't push duplicates of the most recent
        if let Some(front) = self.recent_detections.front() {
            if front.book_number == verse_ref.book_number
                && front.chapter == verse_ref.chapter
                && front.verse_start == verse_ref.verse_start
            {
                return;
            }
        }
        self.recent_detections.push_front(verse_ref.clone());
        if self.recent_detections.len() > 5 {
            self.recent_detections.pop_back();
        }
    }

    /// Build a Detection from a resolved `VerseRef`.
    #[expect(clippy::unused_self, reason = "method kept on self for future extensibility")]
    fn make_direct_detection(
        &self,
        verse_ref: &VerseRef,
        confidence: f64,
        text: &str,
        start: usize,
        end: usize,
    ) -> Detection {
        let snippet = extract_snippet(text, start, end.min(text.len()));
        Detection::direct(verse_ref.clone(), confidence, snippet)
    }
}

impl Default for DirectDetector {
    fn default() -> Self {
        Self::new()
    }
}


/// Compute a confidence score for the detection.
/// Full explicit references (book + chapter + verse) get 1.0.
/// References missing some parts get lower scores.
fn compute_confidence(_resolved: &VerseRef, original: &VerseRef) -> f64 {
    let mut confidence: f64 = 0.90;

    // Bonus for having explicit chapter
    if original.chapter > 0 {
        confidence += 0.04;
    }

    // Bonus for having explicit verse
    if original.verse_start > 0 {
        confidence += 0.04;
    }

    // Bonus for having explicit book
    if original.book_number > 0 {
        confidence += 0.02;
    }

    confidence.min(1.0_f64)
}

/// Extract a snippet of text around the reference for context.
fn extract_snippet(text: &str, start: usize, end: usize) -> String {
    let snippet_start = start.saturating_sub(30);
    let snippet_end = if end + 30 < text.len() {
        end + 30
    } else {
        text.len()
    };

    // Adjust to word boundaries
    let snippet_start = text[snippet_start..start]
        .rfind(' ')
        .map_or(snippet_start, |p| snippet_start + p + 1);

    let snippet_end = text[end..snippet_end]
        .find(' ')
        .map_or(snippet_end, |p| {
            // Find the end of the relevant portion (after a few more words)
            let after_space = end + p + 1;
            text[after_space..snippet_end]
                .find(' ')
                .map_or(snippet_end, |p2| after_space + p2)
        });

    text[snippet_start..snippet_end].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::DetectionSource;

    #[test]
    fn test_basic_reference() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Jesus said in John 3:16 that God loved the world");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "John");
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 16);
    }

    #[test]
    fn test_spoken_reference() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("David in Psalm thirty two verse one now says");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Psalms");
        assert_eq!(results[0].verse_ref.chapter, 32);
        assert_eq!(results[0].verse_ref.verse_start, 1);
    }

    #[test]
    fn test_verse_range() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Let's read Romans 8:28-30 together");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Romans");
        assert_eq!(results[0].verse_ref.chapter, 8);
        assert_eq!(results[0].verse_ref.verse_start, 28);
        assert_eq!(results[0].verse_ref.verse_end, Some(30));
    }

    #[test]
    fn test_numbered_book() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Paul wrote in 1 Corinthians 13:4 about love");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "1 Corinthians");
        assert_eq!(results[0].verse_ref.chapter, 13);
        assert_eq!(results[0].verse_ref.verse_start, 4);
    }

    #[test]
    fn test_chapter_only_held_as_incomplete() {
        // Chapter-only references are NOT emitted — just held as incomplete for refinement
        let mut detector = DirectDetector::new();
        let results = detector.detect("Genesis 3 is about the fall of man");
        assert!(results.is_empty()); // No emission
        assert!(detector.incomplete.is_some()); // Held for refinement
        let inc = detector.incomplete.as_ref().unwrap();
        assert_eq!(inc.verse_ref.book_name, "Genesis");
        assert_eq!(inc.verse_ref.chapter, 3);
    }

    #[test]
    fn test_chapter_only_no_duplicate_on_repeat() {
        // Same book+chapter in a subsequent call — still held, no emission
        let mut detector = DirectDetector::new();
        let results = detector.detect("Genesis 3");
        assert!(results.is_empty());
        assert!(detector.incomplete.is_some());

        // Same text again — still held
        let results = detector.detect("Genesis 3");
        assert!(results.is_empty());
        assert!(detector.incomplete.is_some());
    }

    #[test]
    fn test_incomplete_ref_completed_by_verse() {
        // Chapter-only held, then refined by verse continuation
        let mut detector = DirectDetector::new();
        // First: chapter-only — held as incomplete, not emitted
        let results = detector.detect("Genesis 3");
        assert!(results.is_empty());
        assert!(detector.incomplete.is_some());

        // Second: verse continuation — refines the detection
        let results = detector.detect("verse 15");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].verse_ref.book_name, "Genesis");
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 15);
        assert!(!results[0].is_chapter_only);
        assert!(detector.incomplete.is_none());
    }

    #[test]
    fn test_new_book_supersedes_incomplete() {
        // EDGE-01: a new book/chapter replaces the pending incomplete cleanly
        let mut detector = DirectDetector::new();
        let results = detector.detect("Genesis 3");
        assert!(results.is_empty()); // chapter-only, not emitted
        assert!(detector.incomplete.is_some());

        // Different book — supersedes Genesis 3
        let results = detector.detect("let's look at John 1");
        assert!(results.is_empty()); // also chapter-only, not emitted
        // Incomplete now tracks John 1, not Genesis 3
        let inc = detector.incomplete.as_ref().unwrap();
        assert_eq!(inc.verse_ref.book_name, "John");
    }

    #[test]
    fn test_abandoned_partial_no_stale_state() {
        // EDGE-02: after timeout, incomplete is cleaned up without re-emission
        let mut detector = DirectDetector::new();
        let results = detector.detect("Genesis 3");
        assert!(results.is_empty()); // chapter-only, not emitted
        assert!(detector.incomplete.is_some());

        // Simulate timeout by replacing with an expired timestamp (exceeds 15s)
        detector.incomplete = Some(IncompleteRef {
            verse_ref: detector.incomplete.as_ref().unwrap().verse_ref.clone(),
            timestamp: Instant::now().checked_sub(std::time::Duration::from_secs(20)).unwrap(),
            chapter_is_default: detector.incomplete.as_ref().unwrap().chapter_is_default,
        });

        // Next detect call should clean up without emitting
        let results = detector.detect("something unrelated");
        assert!(results.is_empty());
        assert!(detector.incomplete.is_none());
    }

    #[test]
    fn test_previous_verse_command() {
        let mut detector = DirectDetector::new();
        // First detect a verse
        let results = detector.detect("John 3:16");
        assert!(!results.is_empty());

        // Then ask for "previous verse"
        let results = detector.detect("can you show me the last verse");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "John");
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 16);
    }

    #[test]
    fn test_previous_verse_no_history() {
        let mut detector = DirectDetector::new();
        // No previous detection — should return empty
        let results = detector.detect("go back to that verse");
        assert!(results.is_empty());
    }

    #[test]
    fn test_no_reference() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("The weather is nice today");
        assert!(results.is_empty());
    }

    #[test]
    fn test_spoken_chapter_verse_keywords() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Isaiah chapter fifty three verse five");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Isaiah");
        assert_eq!(results[0].verse_ref.chapter, 53);
        assert_eq!(results[0].verse_ref.verse_start, 5);
    }

    #[test]
    fn test_multiple_references() {
        let mut detector = DirectDetector::new();
        let results =
            detector.detect("Compare John 3:16 with Romans 5:8 for understanding God's love");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].verse_ref.book_name, "John");
        assert_eq!(results[1].verse_ref.book_name, "Romans");
    }

    #[test]
    fn test_confidence_range() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("John 3:16");
        assert!(!results.is_empty());
        assert!(results[0].confidence >= 0.90);
        assert!(results[0].confidence <= 1.0);
    }

    #[test]
    fn test_detection_source() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("John 3:16");
        assert!(!results.is_empty());
        assert!(matches!(
            results[0].source,
            DetectionSource::DirectReference
        ));
    }

    #[test]
    fn test_clean_transcript() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Please open your bibles to Ephesians chapter 6 verse 10");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Ephesians");
    }

    #[test]
    fn test_clean_transcript_lets_turn_to() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Let's turn to Romans 8:28 and read together");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Romans");
        assert_eq!(results[0].verse_ref.chapter, 8);
        assert_eq!(results[0].verse_ref.verse_start, 28);
    }

    #[test]
    fn test_clean_transcript_the_bible_says_in() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("The bible says in John 3:16 that God loved the world");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "John");
    }

    #[test]
    fn test_clean_transcript_look_at() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Now look at Genesis 1:1 for the beginning");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Genesis");
    }

    #[test]
    fn test_fuzzy_fallback_filipians() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Filipians chapter 4 verse 13");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Philippians");
        assert_eq!(results[0].verse_ref.chapter, 4);
        assert_eq!(results[0].verse_ref.verse_start, 13);
    }

    // ========== Translation Command Detection Tests ==========

    #[test]
    fn test_translation_command_basic_kjv() {
        let detector = DirectDetector::new();
        assert_eq!(detector.detect_translation_command("give me kjv"), Some("KJV".to_string()));
        assert_eq!(detector.detect_translation_command("read in kjv"), Some("KJV".to_string()));
        assert_eq!(detector.detect_translation_command("switch to kjv"), Some("KJV".to_string()));
    }

    #[test]
    fn test_translation_command_full_names() {
        let detector = DirectDetector::new();
        assert_eq!(
            detector.detect_translation_command("king james version"),
            Some("KJV".to_string())
        );
    }

    #[test]
    fn test_translation_command_bare_abbreviations() {
        let detector = DirectDetector::new();
        assert_eq!(detector.detect_translation_command("kjv"), Some("KJV".to_string()));
    }

    #[test]
    fn test_translation_command_in_sentence() {
        let detector = DirectDetector::new();
        assert_eq!(
            detector.detect_translation_command("show me genesis 3:16 in the kjv"),
            Some("KJV".to_string())
        );
        assert_eq!(
            detector.detect_translation_command("i want to read that in reina valera"),
            Some("SpaRV".to_string())
        );
    }

    #[test]
    fn test_translation_command_non_english() {
        let detector = DirectDetector::new();
        // Spanish
        assert_eq!(detector.detect_translation_command("give me spanish"), Some("SpaRV".to_string()));
        assert_eq!(detector.detect_translation_command("read in reina valera"), Some("SpaRV".to_string()));
        assert_eq!(detector.detect_translation_command("in spanish"), Some("SpaRV".to_string()));

        // French
        assert_eq!(detector.detect_translation_command("give me french"), Some("FreJND".to_string()));
        assert_eq!(detector.detect_translation_command("read in french"), Some("FreJND".to_string()));
        assert_eq!(detector.detect_translation_command("darby french"), Some("FreJND".to_string()));

        // Portuguese
        assert_eq!(detector.detect_translation_command("give me portuguese"), Some("PorBLivre".to_string()));
        assert_eq!(detector.detect_translation_command("biblia livre"), Some("PorBLivre".to_string()));
        assert_eq!(detector.detect_translation_command("in portuguese"), Some("PorBLivre".to_string()));
    }

    #[test]
    fn test_translation_command_case_insensitive() {
        let detector = DirectDetector::new();
        assert_eq!(detector.detect_translation_command("GIVE ME KJV"), Some("KJV".to_string()));
        assert_eq!(detector.detect_translation_command("Read In King James"), Some("KJV".to_string()));
        assert_eq!(detector.detect_translation_command("READ IN SPANISH"), Some("SpaRV".to_string()));
    }

    #[test]
    fn test_translation_command_show_me_variations() {
        let detector = DirectDetector::new();
        assert_eq!(detector.detect_translation_command("show me kjv"), Some("KJV".to_string()));
        assert_eq!(detector.detect_translation_command("show me french"), Some("FreJND".to_string()));
    }

    #[test]
    fn test_translation_command_no_match() {
        let detector = DirectDetector::new();
        assert_eq!(detector.detect_translation_command("genesis 3 verse 16"), None);
        assert_eq!(detector.detect_translation_command("the weather is nice"), None);
        assert_eq!(detector.detect_translation_command("tell me about the bible"), None);
    }

    #[test]
    fn test_translation_command_partial_match() {
        let detector = DirectDetector::new();
        // Should match even with extra words
        assert_eq!(
            detector.detect_translation_command("i would like to read that in portuguese please"),
            Some("PorBLivre".to_string())
        );
        assert_eq!(
            detector.detect_translation_command("could you show me that verse in king james"),
            Some("KJV".to_string())
        );
    }

    // ========== Cross-Segment Detection Tests ==========

    #[test]
    fn test_cross_segment_acts_3_22() {
        // The exact bug scenario from logs:
        // "...Acts" → "chapter three..." → "22..."
        let mut detector = DirectDetector::new();

        // Segment 1: Book-only "Acts"
        let results = detector.detect("God had put in his mouth. Acts");
        assert!(results.is_empty());
        assert!(detector.incomplete.is_some());
        let inc = detector.incomplete.as_ref().unwrap();
        assert_eq!(inc.verse_ref.book_name, "Acts");
        assert!(inc.chapter_is_default);

        // Segment 2: Chapter continuation
        let results = detector.detect("chapter three, and I'm reading from verse");
        assert!(results.is_empty()); // ChapterOnly — still waiting for verse
        assert!(detector.incomplete.is_some());
        let inc = detector.incomplete.as_ref().unwrap();
        assert_eq!(inc.verse_ref.chapter, 3);
        assert!(!inc.chapter_is_default);

        // Segment 3: Verse completion via bare number
        let results = detector.detect("22. Acts three, for Moses truly");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Acts");
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 22);
    }

    #[test]
    fn test_cross_segment_chapter_and_verse_combined() {
        // Book-only → "chapter 3 verse 22" in one segment
        let mut detector = DirectDetector::new();

        let results = detector.detect("let's read Acts");
        assert!(results.is_empty());

        let results = detector.detect("chapter 3 verse 22");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Acts");
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 22);
    }

    #[test]
    fn test_bare_number_as_chapter_after_book_only() {
        // "Acts" → "3" → "22"
        let mut detector = DirectDetector::new();

        let results = detector.detect("turn to Acts");
        assert!(results.is_empty());
        assert!(detector.incomplete.as_ref().unwrap().chapter_is_default);

        // Bare "3" = chapter (because book-only)
        let results = detector.detect("3");
        assert!(results.is_empty());
        let inc = detector.incomplete.as_ref().unwrap();
        assert_eq!(inc.verse_ref.chapter, 3);

        // Bare "22" = verse (chapter already set)
        let results = detector.detect("22");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 22);
    }

    #[test]
    fn test_verse_keyword_anywhere_in_text() {
        // "Genesis 3" → "and I'm reading from verse 15"
        let mut detector = DirectDetector::new();

        let results = detector.detect("Genesis 3");
        assert!(results.is_empty());

        let results = detector.detect("and I'm reading from verse 15");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.chapter, 3);
        assert_eq!(results[0].verse_ref.verse_start, 15);
    }

    #[test]
    fn test_collapse_spaced_digits_psalm() {
        assert_eq!(collapse_spaced_digits("Psalm 1 1 9"), "Psalm 119");
    }

    #[test]
    fn test_collapse_spaced_digits_john() {
        assert_eq!(collapse_spaced_digits("John 3 1 6"), "John 316");
    }

    #[test]
    fn test_collapse_spaced_digits_single_digit_unchanged() {
        assert_eq!(collapse_spaced_digits("John 3"), "John 3");
    }

    #[test]
    fn test_collapse_spaced_digits_two_digits_preserved() {
        // A run of exactly two single digits is NOT collapsed: "Matthew 1 1"
        // is chapter+verse (1:1), not the number 11. See collapse_spaced_digits.
        assert_eq!(collapse_spaced_digits("Matthew 1 1"), "Matthew 1 1");
        assert_eq!(collapse_spaced_digits("John 3 1"), "John 3 1");
        assert_eq!(collapse_spaced_digits("1 Corinthians 1 3"), "1 Corinthians 1 3");
    }

    #[test]
    fn test_matthew_one_one_resolves_to_verse() {
        // Regression: "Matthew 1 1" must resolve to Matthew 1:1, not be collapsed
        // to "Matthew 11" (chapter-only, held and never emitted).
        let mut detector = DirectDetector::new();
        let results = detector.detect("Matthew 1 1");
        assert_eq!(results.len(), 1, "expected Matthew 1:1 to be emitted");
        assert_eq!(results[0].verse_ref.book_name, "Matthew");
        assert_eq!(results[0].verse_ref.chapter, 1);
        assert_eq!(results[0].verse_ref.verse_start, 1);
    }

    #[test]
    fn test_collapse_spaced_digits_integration() {
        let mut detector = DirectDetector::new();
        let results = detector.detect("Psalm 1 1 9 verse 1");
        assert!(!results.is_empty());
        assert_eq!(results[0].verse_ref.book_name, "Psalms");
        assert_eq!(results[0].verse_ref.chapter, 119);
        assert_eq!(results[0].verse_ref.verse_start, 1);
    }

    // ========== Navigation Command Tests ==========
    //
    // These classify direction only. The verse to step *from* (and chapter
    // roll-over) is resolved frontend-side against the live selection, so no
    // anchor/seed is needed here.

    #[test]
    fn test_nav_next_verse() {
        let d = DirectDetector::new();
        assert_eq!(d.detect_navigation_command("next verse"), Some(NavDirection::Next));
    }

    #[test]
    fn test_nav_next_verse_natural_phrasing() {
        let d = DirectDetector::new();
        for cmd in [
            "turn to the next verse",
            "let's go to the next verse",
            "read on",
            "keep reading",
            "next one",
        ] {
            assert_eq!(
                d.detect_navigation_command(cmd),
                Some(NavDirection::Next),
                "command: {cmd}"
            );
        }
    }

    #[test]
    fn test_nav_previous_verse() {
        let d = DirectDetector::new();
        for cmd in ["previous verse", "go back one verse", "the verse before", "step back"] {
            assert_eq!(
                d.detect_navigation_command(cmd),
                Some(NavDirection::Previous),
                "command: {cmd}"
            );
        }
    }

    #[test]
    fn test_nav_ignores_long_utterance() {
        // Preaching that merely mentions the next verse must not advance.
        let d = DirectDetector::new();
        assert!(
            d.detect_navigation_command(
                "and when you look at the next verse you will see something",
            )
            .is_none()
        );
    }

    #[test]
    fn test_nav_ignores_explicit_reference() {
        // "next verse" alongside a real reference is not a bare command.
        let d = DirectDetector::new();
        assert!(d.detect_navigation_command("Genesis 1 1 next verse").is_none());
    }

    #[test]
    fn test_nav_no_command() {
        let d = DirectDetector::new();
        assert!(d.detect_navigation_command("the weather is nice today").is_none());
    }

    // ========== Verse Command Tests ==========
    //
    // detect_verse_command unifies relative steps and absolute jumps. Like the
    // nav classifier it returns intent only; the frontend resolves the target
    // against the live selection.

    #[test]
    fn test_verse_absolute_by_number() {
        let d = DirectDetector::new();
        for (cmd, verse) in [
            ("verse 3", 3),
            ("go to verse 5", 5),
            ("start from verse 10", 10),
            ("verse three", 3),
            ("go to verse fifteen", 15),
        ] {
            assert_eq!(
                d.detect_verse_command(cmd),
                Some(VerseCommand::Absolute { verse }),
                "command: {cmd}"
            );
        }
    }

    #[test]
    fn test_verse_absolute_by_ordinal() {
        // "the third verse" == "verse 3"; ordinals collapse to the cardinal.
        let d = DirectDetector::new();
        for (cmd, verse) in [
            ("go to the third verse", 3),
            ("turn the third verse", 3),
            ("the fifth verse", 5),
            ("go to the fifteenth verse", 15),
            ("the 15th verse", 15),
            ("the twentieth verse", 20),
            ("the twenty first verse", 21),
        ] {
            assert_eq!(
                d.detect_verse_command(cmd),
                Some(VerseCommand::Absolute { verse }),
                "command: {cmd}"
            );
        }
    }

    #[test]
    fn test_verse_relative_single() {
        let d = DirectDetector::new();
        assert_eq!(
            d.detect_verse_command("next verse"),
            Some(VerseCommand::Relative {
                direction: NavDirection::Next,
                count: 1,
            })
        );
        assert_eq!(
            d.detect_verse_command("go to the previous verse"),
            Some(VerseCommand::Relative {
                direction: NavDirection::Previous,
                count: 1,
            })
        );
    }

    #[test]
    fn test_verse_relative_with_count() {
        let d = DirectDetector::new();
        assert_eq!(
            d.detect_verse_command("skip to the next two verses"),
            Some(VerseCommand::Relative {
                direction: NavDirection::Next,
                count: 2,
            })
        );
        assert_eq!(
            d.detect_verse_command("go back three verses"),
            Some(VerseCommand::Relative {
                direction: NavDirection::Previous,
                count: 3,
            })
        );
    }

    #[test]
    fn test_verse_ignores_long_utterance() {
        // Preaching that names a verse must not move the screen.
        let d = DirectDetector::new();
        assert!(
            d.detect_verse_command(
                "and when you get to the third verse you will see what Paul means",
            )
            .is_none()
        );
    }

    #[test]
    fn test_verse_ignores_explicit_reference() {
        // A real book reference is a jump the main detector owns, not a command.
        let d = DirectDetector::new();
        assert!(d.detect_verse_command("John chapter 3 verse 16").is_none());
        assert!(d.detect_verse_command("Genesis verse 5").is_none());
    }

    #[test]
    fn test_verse_ignores_chapter_navigation() {
        // "chapter" belongs to reading mode.
        let d = DirectDetector::new();
        assert!(d.detect_verse_command("go to chapter 3 verse 5").is_none());
    }

    #[test]
    fn test_verse_ignores_ambiguous_direction() {
        let d = DirectDetector::new();
        assert!(d.detect_verse_command("next verse or previous verse").is_none());
    }

    #[test]
    fn test_verse_no_command() {
        let d = DirectDetector::new();
        assert!(d.detect_verse_command("the weather is nice today").is_none());
        assert!(d.detect_verse_command("let us pray together").is_none());
    }
}
