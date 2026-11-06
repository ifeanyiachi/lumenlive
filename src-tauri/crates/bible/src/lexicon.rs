use serde::{Deserialize, Serialize};

use crate::db::BibleDb;
use crate::error::BibleError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OriginalWord {
    pub position: i32,
    pub word: String,
    pub translit: Option<String>,
    pub strong_number: Option<String>,
    pub morph: Option<String>,
    pub gloss: Option<String>,
    /// The English word in the verse this original word aligns to (its
    /// translation in context), e.g. "God" for `θεός`. Populated only by
    /// [`BibleDb::get_aligned_verse_words`] (which has the verse's English text);
    /// `None` from the plain [`BibleDb::get_verse_words`] path or when no English
    /// word could be matched.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub english_word: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LexiconEntry {
    pub strong_number: String,
    pub language: String,
    pub lemma: Option<String>,
    pub translit: Option<String>,
    pub pronunciation: Option<String>,
    pub definition: Option<String>,
    pub kjv_usage: Option<String>,
    pub derivation: Option<String>,
}

impl BibleDb {
    /// Returns all original-language words for a verse, ordered by position.
    /// Returns an empty vec if the lexicon tables have not been populated yet.
    ///
    /// Greek words (`STEPBible` TAGNT) carry their own per-word transliteration
    /// and contextual English gloss. Hebrew words (OSHB) don't — the source only has
    /// word/Strong's/morph — so we backfill `translit` and `gloss` from the
    /// Strong's lexicon by Strong's number (the lemma's xlit + KJV usage). The
    /// `COALESCE` keeps each word's own value when present and only falls back to
    /// the lexicon when it's `NULL`, so Greek is unaffected.
    ///
    /// `english_word` is left `None` here; use [`Self::get_aligned_verse_words`]
    /// when the verse's English text is available and per-word alignment is wanted.
    pub fn get_verse_words(
        &self,
        book_number: i32,
        chapter: i32,
        verse: i32,
    ) -> Result<Vec<OriginalWord>, BibleError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT ow.position, ow.word, \
                    COALESCE(ow.translit, sl.translit) AS translit, \
                    ow.strong_number, ow.morph, \
                    COALESCE(ow.gloss, sl.kjv_usage) AS gloss \
             FROM original_words ow \
             LEFT JOIN strong_lexicon sl ON sl.strong_number = ow.strong_number \
             WHERE ow.book_number = ?1 AND ow.chapter = ?2 AND ow.verse = ?3 \
             ORDER BY ow.position ASC",
        )?;
        let rows = stmt.query_map(rusqlite::params![book_number, chapter, verse], |row| {
            Ok(OriginalWord {
                position: row.get(0)?,
                word: row.get(1)?,
                translit: row.get(2)?,
                strong_number: row.get(3)?,
                morph: row.get(4)?,
                gloss: row.get(5)?,
                english_word: None,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Builds an annotated verse string with inline original-language
    /// transliterations, so the preview can render the meaning side-by-side with
    /// the English (Greek and Hebrew alike).
    ///
    /// Each original word's English gloss is matched against the English
    /// translation and the transliteration inserted in parentheses after the
    /// matched word. Greek (NT) glosses are clean, contextual, per-word phrases;
    /// Hebrew (OT) glosses are the Strong's KJV-usage lists backfilled by
    /// [`Self::get_verse_words`], which need broader matching (see
    /// [`annotate_text`]). Returns `None` if no interlinear data exists.
    pub fn get_annotated_verse(
        &self,
        book_number: i32,
        chapter: i32,
        verse: i32,
        english_text: &str,
    ) -> Result<Option<String>, BibleError> {
        let words = self.get_verse_words(book_number, chapter, verse)?;
        if words.is_empty() {
            return Ok(None);
        }

        let gloss_entries: Vec<(String, String)> = words
            .iter()
            .filter_map(|w| {
                let gloss = w.gloss.as_ref()?;
                let translit = w.translit.as_ref()?;
                if gloss.is_empty() || translit.is_empty() {
                    return None;
                }
                Some((gloss.clone(), translit.clone()))
            })
            .collect();

        if gloss_entries.is_empty() {
            return Ok(None);
        }

        // OT books (1–39) are Hebrew; NT (40+) is Greek. The two use different
        // gloss shapes, so the matcher branches on this.
        let hebrew = book_number <= 39;
        Ok(Some(annotate_text(english_text, &gloss_entries, hebrew)))
    }

    /// Like [`Self::get_verse_words`], but also fills each word's `english_word`
    /// with the word it aligns to in `english_text` (its in-context translation,
    /// e.g. "God" for `θεός`). Uses the same gloss→text matcher as
    /// [`Self::get_annotated_verse`], claiming each English token at most once so
    /// repeated original words map to distinct occurrences.
    pub fn get_aligned_verse_words(
        &self,
        book_number: i32,
        chapter: i32,
        verse: i32,
        english_text: &str,
    ) -> Result<Vec<OriginalWord>, BibleError> {
        let mut words = self.get_verse_words(book_number, chapter, verse)?;
        let hebrew = book_number <= 39;
        let tokens = tokenize_english(english_text);
        let mut matched = vec![false; tokens.len()];

        for w in &mut words {
            // Clone the gloss so the immutable borrow ends before we write back.
            let gloss = match &w.gloss {
                Some(g) if !g.is_empty() => g.clone(),
                _ => continue,
            };
            if let Some(i) = find_gloss_token(&tokens, &matched, &gloss, hebrew) {
                matched[i] = true;
                // The token's word part, without trailing punctuation.
                w.english_word = Some(tokens[i].0.clone());
            }
        }

        Ok(words)
    }

    /// Returns the Strong's lexicon entry for a given number (e.g. "H1254" / "G2316").
    pub fn get_lexicon_entry(
        &self,
        strong_number: &str,
    ) -> Result<Option<LexiconEntry>, BibleError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT strong_number, language, lemma, translit, pronunciation, definition, kjv_usage, derivation \
             FROM strong_lexicon \
             WHERE strong_number = ?1",
        )?;
        let mut rows = stmt.query_map(rusqlite::params![strong_number], |row| {
            Ok(LexiconEntry {
                strong_number: row.get(0)?,
                language: row.get(1)?,
                lemma: row.get(2)?,
                translit: row.get(3)?,
                pronunciation: row.get(4)?,
                definition: row.get(5)?,
                kjv_usage: row.get(6)?,
                derivation: row.get(7)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }
}

/// Splits English text into tokens preserving punctuation attached to words.
/// "For God," → [("For", ""), ("God", ",")]
fn tokenize_english(text: &str) -> Vec<(String, String)> {
    let mut tokens = Vec::new();
    for raw in text.split_whitespace() {
        let word_end = raw
            .char_indices()
            .rev()
            .find(|(_, c)| c.is_alphanumeric())
            .map_or(raw.len(), |(i, c)| i + c.len_utf8());
        let word = &raw[..word_end];
        let punct = &raw[word_end..];
        tokens.push((word.to_string(), punct.to_string()));
    }
    tokens
}

/// Simple English stemming: strip common suffixes to improve matching.
fn stem(word: &str) -> String {
    let w = word.to_lowercase();
    for suffix in &[
        "ing", "tion", "ed", "eth", "est", "es", "er", "ly", "ness", "ment", "ful", "'s",
    ] {
        if let Some(stripped) = w.strip_suffix(suffix) {
            if stripped.len() >= 2 {
                return stripped.to_string();
            }
        }
    }
    if w.ends_with('s') && w.len() > 3 {
        return w[..w.len() - 1].to_string();
    }
    w
}

/// Finds the first *unmatched* English token index that `gloss` should map to,
/// or `None`. Does not mutate `matched` — the caller marks the returned index so
/// each token is claimed once. This is the shared matcher behind both the inline
/// annotation ([`annotate_text`]) and per-word alignment
/// ([`BibleDb::get_aligned_verse_words`]).
///
/// Greek and Hebrew glosses have different shapes, so matching branches on
/// `hebrew`:
/// - **Greek** (`hebrew == false`): the `STEPBible` gloss is a clean, contextual
///   per-word phrase (e.g. "the beginning"). Split on `/` variants, drop a small
///   article/preposition stop-list, and match a single-word gloss directly or a
///   multi-word gloss on its *last* content word.
/// - **Hebrew** (`hebrew == true`): the gloss is the Strong's KJV-usage list
///   (e.g. "bear, beget, birth(-day), born…") with punctuation, parentheticals,
///   and many senses. Flatten it to its alphabetic words in order and try each
///   content word (see [`hebrew_content_words`]) until one hits an unmatched
///   English token — this recovers proper names, nouns, and verbs that the
///   Greek path's last-word rule would miss.
fn find_gloss_token(
    tokens: &[(String, String)],
    matched: &[bool],
    gloss: &str,
    hebrew: bool,
) -> Option<usize> {
    // First unmatched token whose stem equals `cand`'s (or matches case-insensitively).
    let try_word = |cand: &str| -> Option<usize> {
        let cand_stem = stem(cand);
        tokens.iter().enumerate().find_map(|(i, (word, _))| {
            (!matched[i] && (stem(word) == cand_stem || word.to_lowercase() == cand.to_lowercase()))
                .then_some(i)
        })
    };

    if hebrew {
        return hebrew_content_words(gloss)
            .iter()
            .find_map(|cand| try_word(cand));
    }

    // Greek: try each "/"-separated variant; first that matches wins.
    for variant in gloss.split('/') {
        let gloss_words: Vec<String> = variant
            .split_whitespace()
            .filter(|w| {
                let lower = w.to_lowercase();
                !matches!(lower.as_str(), "the" | "a" | "an" | "to" | "of" | "-")
            })
            .map(std::string::ToString::to_string)
            .collect();

        if gloss_words.is_empty() {
            continue;
        }

        // Single-word gloss matches directly; multi-word matches its last
        // content word (its head, e.g. "the beginning" → "beginning").
        if let Some(i) = try_word(&gloss_words[gloss_words.len() - 1]) {
            return Some(i);
        }
    }
    None
}

/// Matches original-language glosses against English text and inserts
/// transliterations after the matched words (see [`find_gloss_token`] for the
/// matching strategy).
fn annotate_text(english_text: &str, gloss_entries: &[(String, String)], hebrew: bool) -> String {
    let tokens = tokenize_english(english_text);
    let mut matched = vec![false; tokens.len()];
    let mut annotations: Vec<Option<String>> = vec![None; tokens.len()];

    for (gloss, translit) in gloss_entries {
        if let Some(i) = find_gloss_token(&tokens, &matched, gloss, hebrew) {
            matched[i] = true;
            annotations[i] = Some(translit.clone());
        }
    }

    let mut result = String::with_capacity(english_text.len() * 2);
    for (i, (word, punct)) in tokens.iter().enumerate() {
        if i > 0 {
            result.push(' ');
        }
        result.push_str(word);
        if let Some(translit) = &annotations[i] {
            result.push_str(punct);
            result.push_str(" (");
            result.push_str(translit);
            result.push(')');
        } else {
            result.push_str(punct);
        }
    }

    result
}

/// Extracts candidate English content words from a Hebrew Strong's KJV-usage
/// gloss, in order. Splits on every non-alphabetic character (so punctuation,
/// commas, slashes, and parentheticals are boundaries), then keeps alphabetic
/// runs of length >= 3 that aren't function words. The single-letter "X"
/// placeholder KJV uses for "unrepresented in English" is dropped by the length
/// filter. E.g. `bear, beget, birth(-day)` becomes `bear`, `beget`, `birth`, `day`.
fn hebrew_content_words(gloss: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut cur = String::new();
    for ch in gloss.chars() {
        if ch.is_ascii_alphabetic() {
            cur.push(ch);
        } else if !cur.is_empty() {
            if cur.len() >= 3 && !is_hebrew_stopword(&cur) {
                words.push(std::mem::take(&mut cur));
            } else {
                cur.clear();
            }
        }
    }
    if cur.len() >= 3 && !is_hebrew_stopword(&cur) {
        words.push(cur);
    }
    words
}

/// English function words (pronouns, prepositions, auxiliaries) that recur
/// across Hebrew KJV-usage lists. Skipping them keeps a Hebrew word's
/// transliteration from landing on an incidental "and"/"thy"/"with" instead of
/// the real content word the entry is about.
fn is_hebrew_stopword(word: &str) -> bool {
    const STOP: &[&str] = &[
        "the",
        "and",
        "for",
        "not",
        "any",
        "one",
        "own",
        "thy",
        "thou",
        "thee",
        "him",
        "her",
        "his",
        "she",
        "them",
        "they",
        "you",
        "your",
        "our",
        "with",
        "who",
        "which",
        "that",
        "this",
        "these",
        "those",
        "will",
        "would",
        "shall",
        "have",
        "hath",
        "had",
        "was",
        "were",
        "are",
        "unto",
        "upon",
        "from",
        "into",
        "out",
        "off",
        "yet",
        "but",
        "nor",
        "all",
        "also",
        "such",
        "when",
        "then",
        "there",
        "here",
        "where",
        "what",
        "whom",
        "whose",
        "itself",
        "himself",
        "themselves",
        "yourselves",
        "being",
        "been",
    ];
    STOP.contains(&word.to_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::{annotate_text, hebrew_content_words};
    use crate::db::BibleDb;
    use rusqlite::Connection;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    fn entry(translit: &str, gloss: &str) -> (String, String) {
        (gloss.to_string(), translit.to_string())
    }

    #[test]
    fn greek_annotation_inserts_transliterations_inline() {
        // Greek glosses are clean/contextual; a multi-word gloss matches its
        // last content word ("the beginning" → "beginning").
        let entries = [
            entry("panta", "All"),
            entry("archē", "the beginning"),
            entry("ōdinōn", "of birth pains"),
        ];
        let out = annotate_text("All these are the beginning of sorrows.", &entries, false);
        assert_eq!(
            out,
            "All (panta) these are the beginning (archē) of sorrows."
        );
        // "of birth pains" head word "pains" isn't in the KJV text → unmatched.
    }

    #[test]
    fn hebrew_annotation_matches_kjv_usage_content_words() {
        // Hebrew glosses are Strong's KJV-usage lists: comma-separated, with
        // parentheticals and trailing punctuation. Each entry's transliteration
        // should still land on the right English word.
        let entries = [
            entry("Chûwr", "Hur."),
            entry("yâlad", "bear, beget, birth(-day), born"),
            entry("ʼÛwrîy", "Uri."),
            // H221 (Uri) occurs twice in the verse, so its entry appears twice.
            entry("ʼÛwrîy", "Uri."),
            entry("Bᵉtsalʼêl", "Bezaleel."),
            entry("ʼêth", "(as such unrepresented in English)."),
        ];
        let out = annotate_text("And Hur begat Uri, and Uri begat Bezaleel.", &entries, true);
        // "begat" (KJV) isn't in yalad's usage list (which has "beget"), so it's
        // left unmatched — but the proper names all resolve.
        assert_eq!(
            out,
            "And Hur (Chûwr) begat Uri, (ʼÛwrîy) and Uri (ʼÛwrîy) begat Bezaleel. (Bᵉtsalʼêl)"
        );
    }

    #[test]
    fn hebrew_stopwords_do_not_capture_function_words() {
        // H853's usage "(as such unrepresented in English)" contains "in", but
        // the Hebrew matcher must not annotate the verse's "In".
        let entries = [entry("ʼêth", "(as such unrepresented in English).")];
        let out = annotate_text("In the beginning God created.", &entries, true);
        assert_eq!(out, "In the beginning God created.");
    }

    #[test]
    fn hebrew_content_words_splits_and_filters() {
        assert_eq!(
            hebrew_content_words("bear, beget, birth(-day), born"),
            vec!["bear", "beget", "birth", "day", "born"]
        );
        // Function/short words ("as", "such", "in") and the "X" placeholder are
        // dropped; only real content words survive.
        assert_eq!(
            hebrew_content_words("(as such unrepresented in English)"),
            vec!["unrepresented", "English"]
        );
        assert!(hebrew_content_words("X (with 853)").is_empty());
    }

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_path(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "ll-lexicon-test-{}-{tag}-{n}.db",
            std::process::id()
        ))
    }

    fn cleanup(path: &Path) {
        for suffix in ["", "-wal", "-shm"] {
            let p = PathBuf::from(format!("{}{suffix}", path.display()));
            let _ = std::fs::remove_file(p);
        }
    }

    /// Build a DB with the two lexicon tables: one Hebrew word (no own
    /// translit/gloss, mirroring the OSHB import) and one Greek word (with its
    /// own contextual translit/gloss, mirroring the TAGNT import).
    fn make_lexicon_db(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE original_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_number INTEGER NOT NULL, chapter INTEGER NOT NULL,
                verse INTEGER NOT NULL, position INTEGER NOT NULL,
                word TEXT NOT NULL, translit TEXT, strong_number TEXT, morph TEXT, gloss TEXT
             );
             CREATE TABLE strong_lexicon (
                strong_number TEXT PRIMARY KEY, language TEXT NOT NULL,
                lemma TEXT, translit TEXT, pronunciation TEXT, definition TEXT,
                kjv_usage TEXT, derivation TEXT
             );
             -- Hebrew word: null translit/gloss, must be backfilled from lexicon.
             INSERT INTO original_words (book_number, chapter, verse, position, word, translit, strong_number, morph, gloss)
               VALUES (13, 2, 20, 1, 'הוֹלִיד', NULL, 'H3205', 'HVhi3ms', NULL);
             -- Greek word: carries its own translit/gloss, must NOT be overwritten.
             INSERT INTO original_words (book_number, chapter, verse, position, word, translit, strong_number, morph, gloss)
               VALUES (40, 24, 8, 1, 'πάντα', 'panta', 'G3956', 'A-NPN', 'All');
             INSERT INTO strong_lexicon (strong_number, language, lemma, translit, kjv_usage, definition)
               VALUES ('H3205', 'hebrew', 'yalad', 'yâlad', 'bear, beget', 'to bear young');
             INSERT INTO strong_lexicon (strong_number, language, lemma, translit, kjv_usage, definition)
               VALUES ('G3956', 'greek', 'pas', 'pas', 'all, every', 'all, any, every');",
        )
        .unwrap();
    }

    #[test]
    fn hebrew_words_backfill_translit_and_gloss_from_lexicon() {
        let path = temp_path("backfill");
        make_lexicon_db(&path);
        let db = BibleDb::open(&path).unwrap();

        let words = db.get_verse_words(13, 2, 20).unwrap();
        assert_eq!(words.len(), 1);
        // Hebrew word had no own translit/gloss → filled from strong_lexicon.
        assert_eq!(words[0].translit.as_deref(), Some("yâlad"));
        assert_eq!(words[0].gloss.as_deref(), Some("bear, beget"));
        // The plain path never aligns to English text.
        assert_eq!(words[0].english_word, None);

        cleanup(&path);
    }

    #[test]
    fn greek_words_keep_their_own_translit_and_gloss() {
        let path = temp_path("greek-keep");
        make_lexicon_db(&path);
        let db = BibleDb::open(&path).unwrap();

        let words = db.get_verse_words(40, 24, 8).unwrap();
        assert_eq!(words.len(), 1);
        // Greek word's own contextual values win over the lexicon fallback.
        assert_eq!(words[0].translit.as_deref(), Some("panta"));
        assert_eq!(words[0].gloss.as_deref(), Some("All"));

        cleanup(&path);
    }

    #[test]
    fn aligned_words_carry_the_in_context_english_word() {
        let path = temp_path("aligned");
        make_lexicon_db(&path);
        let db = BibleDb::open(&path).unwrap();

        // Greek: gloss "All" aligns to the verse's "All".
        let greek = db
            .get_aligned_verse_words(40, 24, 8, "All these are the beginning.")
            .unwrap();
        assert_eq!(greek[0].english_word.as_deref(), Some("All"));

        // Hebrew: gloss "bear, beget" aligns to "bear" (punctuation stripped).
        let hebrew = db
            .get_aligned_verse_words(13, 2, 20, "she will bear a son.")
            .unwrap();
        assert_eq!(hebrew[0].english_word.as_deref(), Some("bear"));

        // No English match → english_word stays None.
        let none = db
            .get_aligned_verse_words(13, 2, 20, "a completely unrelated clause")
            .unwrap();
        assert_eq!(none[0].english_word, None);

        cleanup(&path);
    }
}
