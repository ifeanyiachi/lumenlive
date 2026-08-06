//! Build a standalone translation `.db` from imported verse data, and read
//! verses back out of a foreign `SQLite` Bible.
//!
//! An import always ends as a standalone `SQLite` file in the exact
//! [`crate::db`] attach shape (local `translation_id = 1`, `books` + `verses`
//! tables, no FTS) so it can be `ATTACH`ed and queried like any downloaded
//! translation. Two producers feed it:
//!  - text formats (txt/csv/.bib) are parsed in the webview into
//!    [`ImportVerse`]s and passed to [`build_translation_db`];
//!  - a foreign `.db`/`.sqlite`/`.bblx` is read here by
//!    [`extract_sqlite_verses`] (the webview can't open one) across a few known
//!    schemas, then handed to the same builder.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;

use crate::error::BibleError;

/// One verse to import. Book is the canonical 1–66 number; the display name and
/// abbreviation come from [`BOOK_META`], not the source, so every imported
/// translation shares one consistent book naming.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportVerse {
    pub book_number: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

/// Translation-level metadata for an import, from the IPC boundary.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportMeta {
    pub abbreviation: String,
    pub title: String,
    pub language: String,
    pub license: String,
}

/// Counts reported back after a successful build.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ImportStats {
    pub verse_count: usize,
    pub book_count: usize,
    /// Rows dropped for an out-of-range book number or non-positive ref.
    pub skipped: usize,
}

/// Schema for a standalone translation DB — identical to the tables the attach
/// layer reads (see `db.rs` / `lookup.rs`) and to `STANDALONE_SCHEMA` in
/// `data/build-store-manifest.ts`. FTS/cross-refs/lexicon are intentionally
/// omitted (attached translations fall back to LIKE search).
const STANDALONE_SCHEMA: &str = "
CREATE TABLE translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abbreviation TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  license TEXT NOT NULL,
  is_copyrighted INTEGER NOT NULL DEFAULT 0,
  is_downloaded INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  book_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  testament TEXT NOT NULL,
  UNIQUE(translation_id, book_number)
);
CREATE TABLE verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  book_number INTEGER NOT NULL,
  book_name TEXT NOT NULL,
  book_abbreviation TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_verses_lookup ON verses(translation_id, book_number, chapter, verse);
CREATE INDEX idx_verses_chapter ON verses(translation_id, book_number, chapter);
";

/// `(name, abbreviation)` for canonical books 1–66, indexed by `book_number - 1`.
/// Kept in step with `src/lib/bible-import/book-names.ts`.
const BOOK_META: [(&str, &str); 66] = [
    ("Genesis", "Gen"),
    ("Exodus", "Exod"),
    ("Leviticus", "Lev"),
    ("Numbers", "Num"),
    ("Deuteronomy", "Deut"),
    ("Joshua", "Josh"),
    ("Judges", "Judg"),
    ("Ruth", "Ruth"),
    ("1 Samuel", "1Sam"),
    ("2 Samuel", "2Sam"),
    ("1 Kings", "1Kgs"),
    ("2 Kings", "2Kgs"),
    ("1 Chronicles", "1Chr"),
    ("2 Chronicles", "2Chr"),
    ("Ezra", "Ezra"),
    ("Nehemiah", "Neh"),
    ("Esther", "Esth"),
    ("Job", "Job"),
    ("Psalms", "Ps"),
    ("Proverbs", "Prov"),
    ("Ecclesiastes", "Eccl"),
    ("Song of Solomon", "Song"),
    ("Isaiah", "Isa"),
    ("Jeremiah", "Jer"),
    ("Lamentations", "Lam"),
    ("Ezekiel", "Ezek"),
    ("Daniel", "Dan"),
    ("Hosea", "Hos"),
    ("Joel", "Joel"),
    ("Amos", "Amos"),
    ("Obadiah", "Obad"),
    ("Jonah", "Jonah"),
    ("Micah", "Mic"),
    ("Nahum", "Nah"),
    ("Habakkuk", "Hab"),
    ("Zephaniah", "Zeph"),
    ("Haggai", "Hag"),
    ("Zechariah", "Zech"),
    ("Malachi", "Mal"),
    ("Matthew", "Matt"),
    ("Mark", "Mark"),
    ("Luke", "Luke"),
    ("John", "John"),
    ("Acts", "Acts"),
    ("Romans", "Rom"),
    ("1 Corinthians", "1Cor"),
    ("2 Corinthians", "2Cor"),
    ("Galatians", "Gal"),
    ("Ephesians", "Eph"),
    ("Philippians", "Phil"),
    ("Colossians", "Col"),
    ("1 Thessalonians", "1Thess"),
    ("2 Thessalonians", "2Thess"),
    ("1 Timothy", "1Tim"),
    ("2 Timothy", "2Tim"),
    ("Titus", "Titus"),
    ("Philemon", "Phlm"),
    ("Hebrews", "Heb"),
    ("James", "Jas"),
    ("1 Peter", "1Pet"),
    ("2 Peter", "2Pet"),
    ("1 John", "1John"),
    ("2 John", "2John"),
    ("3 John", "3John"),
    ("Jude", "Jude"),
    ("Revelation", "Rev"),
];

/// Look up a book's `(name, abbreviation, testament)` by 1–66 number.
fn book_meta(book_number: i64) -> Option<(&'static str, &'static str, &'static str)> {
    if !(1..=66).contains(&book_number) {
        return None;
    }
    let (name, abbrev) = BOOK_META[(book_number - 1) as usize];
    let testament = if book_number <= 39 { "OT" } else { "NT" };
    Some((name, abbrev, testament))
}

/// Build a standalone translation DB at `db_path` from `verses`.
///
/// Any existing file at `db_path` is replaced. Verses with an out-of-range book
/// number or a non-positive chapter/verse are skipped (counted in
/// [`ImportStats::skipped`]). The translation row is inserted first so it takes
/// local id 1, matching what the attach layer expects.
pub fn build_translation_db(
    db_path: &Path,
    meta: &ImportMeta,
    verses: &[ImportVerse],
) -> Result<ImportStats, BibleError> {
    if verses.is_empty() {
        return Err(BibleError::Internal(
            "no verses to import (source produced 0 verses)".to_string(),
        ));
    }
    if db_path.exists() {
        std::fs::remove_file(db_path)
            .map_err(|e| BibleError::Internal(format!("replace target db: {e}")))?;
    }

    let mut conn = Connection::open(db_path)?;
    conn.execute_batch(STANDALONE_SCHEMA)?;

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO translations (abbreviation, title, language, license, is_copyrighted, is_downloaded) \
         VALUES (?1, ?2, ?3, ?4, 0, 1)",
        rusqlite::params![meta.abbreviation, meta.title, meta.language, meta.license],
    )?;
    let translation_id = tx.last_insert_rowid();

    // Insert a `books` row lazily the first time a book number appears, so only
    // books actually present get rows. book_number -> book_id.
    let mut book_ids: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut verse_count = 0usize;
    let mut skipped = 0usize;

    {
        let mut insert_book = tx.prepare(
            "INSERT INTO books (translation_id, book_number, name, abbreviation, testament) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        let mut insert_verse = tx.prepare(
            "INSERT INTO verses (translation_id, book_id, book_number, book_name, book_abbreviation, chapter, verse, text) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;

        for v in verses {
            let Some((name, abbrev, testament)) = book_meta(v.book_number) else {
                skipped += 1;
                continue;
            };
            if v.chapter < 1 || v.verse < 1 {
                skipped += 1;
                continue;
            }
            let book_id = if let Some(id) = book_ids.get(&v.book_number) {
                *id
            } else {
                insert_book.execute(rusqlite::params![
                    translation_id,
                    v.book_number,
                    name,
                    abbrev,
                    testament
                ])?;
                let id = tx.last_insert_rowid();
                book_ids.insert(v.book_number, id);
                id
            };
            insert_verse.execute(rusqlite::params![
                translation_id,
                book_id,
                v.book_number,
                name,
                abbrev,
                v.chapter,
                v.verse,
                v.text.trim()
            ])?;
            verse_count += 1;
        }
    }

    tx.commit()?;
    if verse_count == 0 {
        // Nothing usable landed — don't leave a valid-but-empty translation.
        // Drop the connection first: an open SQLite handle keeps the file locked
        // on Windows, so removal would otherwise fail.
        drop(conn);
        let _ = std::fs::remove_file(db_path);
        return Err(BibleError::Internal(
            "no valid verses after filtering (check book numbering)".to_string(),
        ));
    }

    Ok(ImportStats {
        verse_count,
        book_count: book_ids.len(),
        skipped,
    })
}

/// Candidate `(sql, book_col_is_number)` shapes tried against a foreign Bible
/// DB, in order. Covers our own standalone schema and the common e-Sword /
/// `MySword` `Bible(Book, Chapter, Verse, Scripture)` layout (book numbered 1–66).
const SQLITE_CANDIDATES: &[&str] = &[
    "SELECT book_number, chapter, verse, text FROM verses",
    "SELECT Book, Chapter, Verse, Scripture FROM Bible",
    "SELECT book, chapter, verse, text FROM verses",
    "SELECT book_number, chapter, verse, scripture FROM Bible",
];

/// Read verses out of a foreign `SQLite` Bible, trying known schemas until one
/// works. Text is de-marked-up (e-Sword/MySword embed HTML-ish tags). Opened
/// read-only so a user's source file is never modified.
pub fn extract_sqlite_verses(source_path: &Path) -> Result<Vec<ImportVerse>, BibleError> {
    let conn = Connection::open_with_flags(
        source_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| BibleError::Internal(format!("open source db: {e}")))?;

    let mut last_err: Option<String> = None;
    for sql in SQLITE_CANDIDATES {
        match try_candidate(&conn, sql) {
            Ok(v) if !v.is_empty() => return Ok(v),
            Ok(_) => last_err = Some(format!("query '{sql}' returned no rows")),
            Err(e) => last_err = Some(e),
        }
    }
    Err(BibleError::Internal(format!(
        "unrecognized SQLite Bible schema — no known verse table found ({})",
        last_err.unwrap_or_else(|| "no candidates matched".to_string())
    )))
}

fn try_candidate(conn: &Connection, sql: &str) -> Result<Vec<ImportVerse>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ImportVerse {
                book_number: row.get(0)?,
                chapter: row.get(1)?,
                verse: row.get(2)?,
                text: strip_markup(&row.get::<_, String>(3)?),
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Remove `<...>` tags and decode the handful of entities that occur in verse
/// text, collapsing whitespace. Enough for e-Sword/MySword/Zefania markup.
fn strip_markup(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut in_tag = false;
    for c in raw.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let decoded = out
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_db(tag: &str) -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!("ll-import-{tag}-{}-{n}.db", std::process::id()))
    }

    fn meta() -> ImportMeta {
        ImportMeta {
            abbreviation: "DEMO".into(),
            title: "Demo Version".into(),
            language: "en".into(),
            license: "Public Domain".into(),
        }
    }

    fn verse(b: i64, c: i64, v: i64, t: &str) -> ImportVerse {
        ImportVerse {
            book_number: b,
            chapter: c,
            verse: v,
            text: t.into(),
        }
    }

    #[test]
    fn builds_attach_ready_db_local_id_1() {
        let path = temp_db("build");
        let verses = vec![
            verse(1, 1, 1, "In the beginning"),
            verse(43, 3, 16, "For God so loved the world"),
        ];
        let stats = build_translation_db(&path, &meta(), &verses).unwrap();
        assert_eq!(stats.verse_count, 2);
        assert_eq!(stats.book_count, 2);

        let conn = Connection::open(&path).unwrap();
        // Translation must be local id 1 (the attach layer routes on it).
        let id: i64 = conn
            .query_row("SELECT id FROM translations ORDER BY id LIMIT 1", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(id, 1);
        // The exact routed John 3:16 lookup the Rust layer runs.
        let text: String = conn
            .query_row(
                "SELECT text FROM verses WHERE translation_id = 1 AND book_number = 43 AND chapter = 3 AND verse = 16",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(text, "For God so loved the world");
        drop(conn);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn skips_out_of_range_books_and_errors_when_all_invalid() {
        let path = temp_db("skip");
        let verses = vec![
            verse(1, 1, 1, "ok"),
            verse(200, 1, 1, "bad"),
            verse(1, 0, 1, "bad"),
        ];
        let stats = build_translation_db(&path, &meta(), &verses).unwrap();
        assert_eq!(stats.verse_count, 1);
        assert_eq!(stats.skipped, 2);
        let _ = std::fs::remove_file(&path);

        let path2 = temp_db("allbad");
        let err = build_translation_db(&path2, &meta(), &[verse(999, 1, 1, "x")]);
        assert!(err.is_err());
        assert!(!path2.exists(), "empty db should be cleaned up");
    }

    #[test]
    fn extracts_from_esword_style_bible_table() {
        let src = temp_db("esword-src");
        {
            let conn = Connection::open(&src).unwrap();
            conn.execute_batch(
                "CREATE TABLE Bible (Book INTEGER, Chapter INTEGER, Verse INTEGER, Scripture TEXT);
                 INSERT INTO Bible VALUES (43, 3, 16, '<b>For</b> God so loved &amp; the world');
                 INSERT INTO Bible VALUES (1, 1, 1, 'In the beginning');",
            )
            .unwrap();
        }
        let verses = extract_sqlite_verses(&src).unwrap();
        assert_eq!(verses.len(), 2);
        let john = verses.iter().find(|v| v.book_number == 43).unwrap();
        assert_eq!(john.text, "For God so loved & the world");
        let _ = std::fs::remove_file(&src);
    }

    #[test]
    fn round_trips_our_own_standalone_schema() {
        let built = temp_db("rt-built");
        build_translation_db(&built, &meta(), &[verse(1, 1, 1, "In the beginning")]).unwrap();
        // Reading a DB we built back out should succeed via the first candidate.
        let verses = extract_sqlite_verses(&built).unwrap();
        assert_eq!(verses.len(), 1);
        assert_eq!(verses[0].book_number, 1);
        let _ = std::fs::remove_file(&built);
    }

    #[test]
    fn unknown_schema_errors() {
        let src = temp_db("unknown");
        {
            let conn = Connection::open(&src).unwrap();
            conn.execute_batch("CREATE TABLE Nope (a, b);").unwrap();
        }
        assert!(extract_sqlite_verses(&src).is_err());
        let _ = std::fs::remove_file(&src);
    }
}
