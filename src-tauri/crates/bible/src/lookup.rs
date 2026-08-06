use crate::db::BibleDb;
use crate::error::BibleError;
use crate::models::{Book, SearchVerse, Translation, Verse};

impl BibleDb {
    /// Look up a verse by its database primary key (verses.id).
    ///
    /// Bundled-DB only: `verses.id` is a per-file rowid, so it isn't meaningful
    /// across attached translation files. This is used by the detection hot path,
    /// which operates on the bundled translation.
    ///
    /// # Panics
    ///
    /// Panics if the internal mutex is poisoned (i.e., a thread panicked
    /// while holding the database lock). This applies to all `BibleDb` methods.
    pub fn get_verse_by_id(&self, id: i64) -> Result<Option<Verse>, BibleError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, translation_id, book_number, book_name, book_abbreviation, chapter, verse, text \
             FROM verses WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(rusqlite::params![id], |row: &rusqlite::Row| {
            Ok(Verse {
                id: row.get(0)?,
                translation_id: row.get(1)?,
                book_number: row.get(2)?,
                book_name: row.get(3)?,
                book_abbreviation: row.get(4)?,
                chapter: row.get(5)?,
                verse: row.get(6)?,
                text: row.get(7)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn get_verse(
        &self,
        translation_id: i64,
        book_number: i32,
        chapter: i32,
        verse: i32,
    ) -> Result<Option<Verse>, BibleError> {
        let route = self.route(translation_id);
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT id, book_number, book_name, book_abbreviation, chapter, verse, text \
             FROM {prefix}verses \
             WHERE translation_id = ?1 AND book_number = ?2 AND chapter = ?3 AND verse = ?4",
            prefix = route.prefix
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut rows = stmt.query_map(
            rusqlite::params![route.local_id, book_number, chapter, verse],
            |row: &rusqlite::Row| verse_row(&route, row),
        )?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn get_chapter(
        &self,
        translation_id: i64,
        book_number: i32,
        chapter: i32,
    ) -> Result<Vec<Verse>, BibleError> {
        let route = self.route(translation_id);
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT id, book_number, book_name, book_abbreviation, chapter, verse, text \
             FROM {prefix}verses \
             WHERE translation_id = ?1 AND book_number = ?2 AND chapter = ?3 \
             ORDER BY verse",
            prefix = route.prefix
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params![route.local_id, book_number, chapter],
            |row: &rusqlite::Row| verse_row(&route, row),
        )?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_verse_range(
        &self,
        translation_id: i64,
        book_number: i32,
        chapter: i32,
        verse_start: i32,
        verse_end: i32,
    ) -> Result<Vec<Verse>, BibleError> {
        let route = self.route(translation_id);
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT id, book_number, book_name, book_abbreviation, chapter, verse, text \
             FROM {prefix}verses \
             WHERE translation_id = ?1 AND book_number = ?2 AND chapter = ?3 \
               AND verse >= ?4 AND verse <= ?5 \
             ORDER BY verse",
            prefix = route.prefix
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            rusqlite::params![route.local_id, book_number, chapter, verse_start, verse_end],
            |row: &rusqlite::Row| verse_row(&route, row),
        )?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// Load all verses for one translation for client-side context search indexing.
    pub fn load_translation_verses_for_search(
        &self,
        translation_id: i64,
    ) -> Result<Vec<SearchVerse>, BibleError> {
        let route = self.route(translation_id);
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT book_number, book_name, chapter, verse, text \
             FROM {prefix}verses \
             WHERE translation_id = ?1 \
             ORDER BY book_number, chapter, verse",
            prefix = route.prefix
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([route.local_id], |row: &rusqlite::Row| {
            Ok(SearchVerse {
                book_number: row.get(0)?,
                book_name: row.get(1)?,
                chapter: row.get(2)?,
                verse: row.get(3)?,
                text: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// List every translation the app can serve: the bundled ones plus any
    /// downloaded translations attached from separate files. Downloaded entries
    /// carry their global id and `is_downloaded = true`. Ordered by id, so the
    /// bundled set comes first.
    pub fn list_translations(&self) -> Result<Vec<Translation>, BibleError> {
        let mut out = {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn.prepare(
                "SELECT id, abbreviation, title, language, is_copyrighted, is_downloaded \
                 FROM translations",
            )?;
            let rows = stmt.query_map([], |row: &rusqlite::Row| {
                Ok(Translation {
                    id: row.get(0)?,
                    abbreviation: row.get(1)?,
                    title: row.get(2)?,
                    language: row.get(3)?,
                    is_copyrighted: row.get(4)?,
                    is_downloaded: row.get(5)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        out.extend(self.attached_translations());
        out.sort_by_key(|t| t.id);
        Ok(out)
    }

    pub fn list_books(&self, translation_id: i64) -> Result<Vec<Book>, BibleError> {
        let route = self.route(translation_id);
        let conn = self.conn.lock().unwrap();
        let sql = format!(
            "SELECT id, book_number, name, abbreviation, testament \
             FROM {prefix}books \
             WHERE translation_id = ?1 \
             ORDER BY book_number",
            prefix = route.prefix
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params![route.local_id], |row: &rusqlite::Row| {
            Ok(Book {
                id: row.get(0)?,
                translation_id: route.display_id,
                book_number: row.get(1)?,
                name: row.get(2)?,
                abbreviation: row.get(3)?,
                testament: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }
}

/// Map a verse row selected as
/// `(id, book_number, book_name, book_abbreviation, chapter, verse, text)` —
/// i.e. without `translation_id`, which is filled from the route's global id so
/// attached-file rows report the id the caller queried with.
fn verse_row(route: &crate::db::Route, row: &rusqlite::Row) -> rusqlite::Result<Verse> {
    Ok(Verse {
        id: row.get(0)?,
        translation_id: route.display_id,
        book_number: row.get(1)?,
        book_name: row.get(2)?,
        book_abbreviation: row.get(3)?,
        chapter: row.get(4)?,
        verse: row.get(5)?,
        text: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {

    use crate::db::BibleDb;
    use rusqlite::{params, Connection};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// A unique temp path for a throwaway `SQLite` file.
    fn temp_path(tag: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!("ll-bible-test-{}-{tag}-{n}.db", std::process::id()))
    }

    fn cleanup(path: &Path) {
        for suffix in ["", "-wal", "-shm"] {
            let p = PathBuf::from(format!("{}{suffix}", path.display()));
            let _ = std::fs::remove_file(p);
        }
    }

    /// (`book_number`, `book_name`, `book_abbreviation`, chapter, verse, text)
    type Row = (i32, &'static str, &'static str, i32, i32, &'static str);

    fn sample_verses() -> Vec<Row> {
        vec![
            (43, "John", "John", 3, 16, "For God so loved the world"),
            (
                43,
                "John",
                "John",
                3,
                17,
                "For God sent not his Son to condemn",
            ),
        ]
    }

    /// Build a standalone single-translation DB file (local translation id = 1)
    /// with the same schema shape the build pipeline emits.
    fn make_db_file(
        path: &Path,
        abbreviation: &str,
        title: &str,
        language: &str,
        copyrighted: bool,
        verses: &[Row],
    ) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE translations (id INTEGER PRIMARY KEY AUTOINCREMENT, abbreviation TEXT NOT NULL UNIQUE, title TEXT NOT NULL, language TEXT NOT NULL, license TEXT NOT NULL, is_copyrighted INTEGER NOT NULL DEFAULT 0, is_downloaded INTEGER NOT NULL DEFAULT 1);
             CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, translation_id INTEGER NOT NULL, book_number INTEGER NOT NULL, name TEXT NOT NULL, abbreviation TEXT NOT NULL, testament TEXT NOT NULL);
             CREATE TABLE verses (id INTEGER PRIMARY KEY AUTOINCREMENT, translation_id INTEGER NOT NULL, book_id INTEGER NOT NULL, book_number INTEGER NOT NULL, book_name TEXT NOT NULL, book_abbreviation TEXT NOT NULL, chapter INTEGER NOT NULL, verse INTEGER NOT NULL, text TEXT NOT NULL);",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO translations (id, abbreviation, title, language, license, is_copyrighted, is_downloaded) VALUES (1, ?1, ?2, ?3, 'Public Domain', ?4, 1)",
            params![abbreviation, title, language, i64::from(copyrighted)],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO books (id, translation_id, book_number, name, abbreviation, testament) VALUES (1, 1, 43, 'John', 'John', 'NT')",
            [],
        )
        .unwrap();
        for v in verses {
            conn.execute(
                "INSERT INTO verses (translation_id, book_id, book_number, book_name, book_abbreviation, chapter, verse, text) VALUES (1, 1, ?1, ?2, ?3, ?4, ?5, ?6)",
                params![v.0, v.1, v.2, v.3, v.4, v.5],
            )
            .unwrap();
        }
    }

    /// The core parity guarantee: querying an attached translation (global id
    /// 1000, local id 1) returns byte-identical verse data to querying the same
    /// content in the main DB (id 1) — only the reported `translation_id` differs.
    #[test]
    fn attached_routing_matches_main() {
        let main_path = temp_path("main");
        let ext_path = temp_path("ext");
        let verses = sample_verses();
        make_db_file(
            &main_path,
            "KJV",
            "King James Version",
            "en",
            false,
            &verses,
        );
        make_db_file(
            &ext_path,
            "WEB",
            "World English Bible",
            "en",
            false,
            &verses,
        );

        let db = BibleDb::open(&main_path).unwrap();
        let info = db.attach_translation(1000, &ext_path).unwrap();
        assert_eq!(info.local_id, 1);
        assert_eq!(info.abbreviation, "WEB");

        let from_main = db.get_chapter(1, 43, 3).unwrap();
        let from_ext = db.get_chapter(1000, 43, 3).unwrap();
        assert_eq!(from_main.len(), 2);
        assert_eq!(from_main.len(), from_ext.len());
        for (m, e) in from_main.iter().zip(&from_ext) {
            assert_eq!(m.book_number, e.book_number);
            assert_eq!(m.book_name, e.book_name);
            assert_eq!(m.book_abbreviation, e.book_abbreviation);
            assert_eq!(m.chapter, e.chapter);
            assert_eq!(m.verse, e.verse);
            assert_eq!(m.text, e.text);
        }

        // Routing reports the id the caller queried with, so verses round-trip.
        assert!(from_main.iter().all(|v| v.translation_id == 1));
        assert!(from_ext.iter().all(|v| v.translation_id == 1000));

        // get_verse and list_books route the same way.
        let v = db.get_verse(1000, 43, 3, 16).unwrap().unwrap();
        assert_eq!(v.text, "For God so loved the world");
        assert_eq!(v.translation_id, 1000);
        let books = db.list_books(1000).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].translation_id, 1000);

        cleanup(&main_path);
        cleanup(&ext_path);
    }

    #[test]
    fn list_translations_unions_downloads() {
        let main_path = temp_path("main");
        let ext_path = temp_path("ext");
        let verses = sample_verses();
        make_db_file(
            &main_path,
            "KJV",
            "King James Version",
            "en",
            false,
            &verses,
        );
        make_db_file(
            &ext_path,
            "WEB",
            "World English Bible",
            "en",
            false,
            &verses,
        );

        let db = BibleDb::open(&main_path).unwrap();
        db.attach_translation(1000, &ext_path).unwrap();

        let list = db.list_translations().unwrap();
        assert_eq!(list.len(), 2);
        // Bundled first (id 1), download second (id 1000, marked downloaded).
        assert_eq!(list[0].id, 1);
        assert_eq!(list[0].abbreviation, "KJV");
        assert_eq!(list[1].id, 1000);
        assert_eq!(list[1].abbreviation, "WEB");
        assert!(list[1].is_downloaded);

        cleanup(&main_path);
        cleanup(&ext_path);
    }

    #[test]
    fn detach_removes_routing_and_listing() {
        let main_path = temp_path("main");
        let ext_path = temp_path("ext");
        let verses = sample_verses();
        make_db_file(
            &main_path,
            "KJV",
            "King James Version",
            "en",
            false,
            &verses,
        );
        make_db_file(
            &ext_path,
            "WEB",
            "World English Bible",
            "en",
            false,
            &verses,
        );

        let db = BibleDb::open(&main_path).unwrap();
        db.attach_translation(1000, &ext_path).unwrap();
        db.detach_translation(1000).unwrap();

        // After detach, the global id routes to main, which has no such rows.
        assert!(db.get_chapter(1000, 43, 3).unwrap().is_empty());
        assert_eq!(db.list_translations().unwrap().len(), 1);
        // Detaching an unknown id is a no-op.
        db.detach_translation(9999).unwrap();

        cleanup(&main_path);
        cleanup(&ext_path);
    }
}
