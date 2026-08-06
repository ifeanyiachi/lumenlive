//! End-to-end smoke test for the Bible import pipeline.
//!
//! Exercises the real path the app runs after IPC, minus the GUI/file-dialog:
//! build a standalone translation DB from imported verses (and from a foreign
//! `SQLite` source), attach it onto a live `BibleDb` under a downloaded-range
//! global id, then query the verse back through the actual `get_verse` /
//! `list_translations` API. If routing, schema, or attach were wrong, these
//! lookups would fail.

use std::sync::atomic::{AtomicU64, Ordering};

use lumenlive_bible::{
    build_translation_db, extract_sqlite_verses, BibleDb, ImportMeta, ImportVerse,
};
use rusqlite::Connection;

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_path(tag: &str) -> std::path::PathBuf {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    std::env::temp_dir().join(format!("ll-e2e-{tag}-{}-{n}", std::process::id()))
}

fn meta(abbrev: &str) -> ImportMeta {
    ImportMeta {
        abbreviation: abbrev.into(),
        title: format!("{abbrev} Test Translation"),
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

/// An empty main DB is enough: imported translations live in their own attached
/// file, so `get_verse` for an attached id never touches the main tables.
fn fresh_bible_db(tag: &str) -> (BibleDb, std::path::PathBuf) {
    let main = temp_path(tag);
    let db = BibleDb::open(&main).expect("open main bible db");
    (db, main)
}

#[test]
fn text_import_is_queryable_through_the_real_lookup() {
    // 1. Build a translation DB from parsed verses (as import_bible_verses does).
    let db_path = temp_path("text.db");
    let verses = vec![
        verse(
            1,
            1,
            1,
            "In the beginning God created the heaven and the earth.",
        ),
        verse(43, 3, 16, "For God so loved the world."),
        verse(62, 4, 8, "God is love."),
    ];
    let stats = build_translation_db(&db_path, &meta("SMOKE"), &verses).unwrap();
    assert_eq!(stats.verse_count, 3);
    assert_eq!(stats.book_count, 3);

    // 2. Attach it onto a live BibleDb at a downloaded-range global id.
    let (bible, main_path) = fresh_bible_db("text-main");
    let global_id = 1000;
    let info = bible.attach_translation(global_id, &db_path).unwrap();
    assert_eq!(info.abbreviation, "SMOKE");

    // 3. Query John 3:16 back through the real routed lookup.
    let john = bible
        .get_verse(global_id, 43, 3, 16)
        .unwrap()
        .expect("John 3:16 should route and return");
    assert_eq!(john.text, "For God so loved the world.");
    assert_eq!(john.book_name, "John");
    assert_eq!(john.translation_id, global_id);

    // 4. It shows up in the translation list the picker reads.
    let translations = bible.list_translations().unwrap();
    assert!(
        translations
            .iter()
            .any(|t| t.id == global_id && t.abbreviation == "SMOKE"),
        "attached translation must appear in list_translations"
    );

    cleanup(&[&db_path, &main_path]);
}

#[test]
fn sqlite_import_roundtrips_through_extract_build_attach_lookup() {
    // A foreign e-Sword/MySword-style source: Bible(Book, Chapter, Verse, Scripture).
    let src = temp_path("src.db");
    {
        let conn = Connection::open(&src).unwrap();
        conn.execute_batch(
            "CREATE TABLE Bible (Book INTEGER, Chapter INTEGER, Verse INTEGER, Scripture TEXT);
             INSERT INTO Bible VALUES (43, 3, 16, '<b>For</b> God so loved the world.');
             INSERT INTO Bible VALUES (1, 1, 1, 'In the beginning.');",
        )
        .unwrap();
    }

    // extract (Rust-side) -> build -> attach -> lookup
    let extracted = extract_sqlite_verses(&src).unwrap();
    assert_eq!(extracted.len(), 2);

    let db_path = temp_path("sqlite-built.db");
    build_translation_db(&db_path, &meta("ESRC"), &extracted).unwrap();

    let (bible, main_path) = fresh_bible_db("sqlite-main");
    bible.attach_translation(1001, &db_path).unwrap();

    let john = bible.get_verse(1001, 43, 3, 16).unwrap().unwrap();
    // Markup was stripped during extraction.
    assert_eq!(john.text, "For God so loved the world.");

    cleanup(&[&src, &db_path, &main_path]);
}

fn cleanup(paths: &[&std::path::Path]) {
    for p in paths {
        let _ = std::fs::remove_file(p);
        // WAL sidecars from the main DB, if any.
        let _ = std::fs::remove_file(format!("{}-wal", p.display()));
        let _ = std::fs::remove_file(format!("{}-shm", p.display()));
    }
}
