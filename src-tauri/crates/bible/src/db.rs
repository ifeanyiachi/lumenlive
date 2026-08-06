use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OpenFlags};

use crate::error::BibleError;

/// The first global translation id handed out to downloaded translations.
///
/// The bundled DB uses small `AUTOINCREMENT` ids (1, 2, 3…), so starting
/// downloaded translations at 1000 guarantees their global ids never collide
/// with a bundled translation — present or future. Every standalone
/// translation file has its own local id (usually 1); the global id is what the
/// frontend and query layer use, and [`BibleDb::route`] maps it back to the
/// file's local id.
pub const FIRST_DOWNLOADED_ID: i64 = 1000;

/// A translation whose verses live in a separate `SQLite` file `ATTACH`ed onto
/// the main connection under a schema alias. Kept in [`BibleDb::attached`] so
/// queries for its global id can be routed to `ext_<id>.verses`.
#[derive(Debug, Clone)]
pub(crate) struct AttachedSource {
    /// SQL schema alias for the attached file, e.g. `ext_1000`.
    pub alias: String,
    /// `translation_id` *inside* the attached file (its local autoincrement id).
    pub local_id: i64,
    pub abbreviation: String,
    pub title: String,
    pub language: String,
    pub is_copyrighted: bool,
}

/// Metadata read back from a freshly attached translation file, returned to the
/// caller so it can be recorded in the install registry.
#[derive(Debug, Clone)]
pub struct AttachedInfo {
    pub local_id: i64,
    pub abbreviation: String,
    pub title: String,
    pub language: String,
    pub is_copyrighted: bool,
}

/// How a query for a (global) translation id is routed to physical storage.
pub(crate) struct Route {
    /// SQL table prefix: empty for the main DB, `ext_N.` for an attached file.
    pub prefix: String,
    /// The `translation_id` to filter on within the routed schema.
    pub local_id: i64,
    /// The id to report back in returned rows — always the caller's global id,
    /// so a verse fetched from an attached file round-trips to further queries.
    pub display_id: i64,
}

pub struct BibleDb {
    pub(crate) conn: Mutex<Connection>,
    /// `global_id -> attached source`, for routing queries to downloaded
    /// translations. Empty until a translation is installed and attached.
    pub(crate) attached: Mutex<HashMap<i64, AttachedSource>>,
}

impl std::fmt::Debug for BibleDb {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BibleDb").finish_non_exhaustive()
    }
}

impl BibleDb {
    pub fn open(path: &Path) -> Result<Self, BibleError> {
        // Prefer a read-write connection with WAL — fast, and correct when the
        // DB lives in a writable location (dev, or copied into AppData). If the
        // containing directory is read-only (e.g. a bundled DB installed under
        // Program Files), the WAL sidecar files can't be created, so fall back
        // to a read-only connection that needs no write access.
        let conn = match Self::open_rw_wal(path) {
            Ok(conn) => conn,
            Err(rw_err) => {
                log::debug!(
                    "Read-write open failed ({rw_err}); opening Bible DB read-only at {}",
                    path.display()
                );
                Self::open_readonly(path)?
            }
        };
        Ok(Self {
            conn: Mutex::new(conn),
            attached: Mutex::new(HashMap::new()),
        })
    }

    /// Open the database read-write and enable WAL journaling.
    fn open_rw_wal(path: &Path) -> Result<Connection, BibleError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        Ok(conn)
    }

    /// Open the database read-only via an `immutable=1` URI. This tells `SQLite`
    /// the file cannot change, so it reads it directly and skips the -wal/-shm
    /// sidecar files and file locking — the only way to open a bundled DB that
    /// lives in a read-only install directory.
    fn open_readonly(path: &Path) -> Result<Connection, BibleError> {
        let uri = format!("file:{}?immutable=1", encode_uri_path(path));
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI;
        let conn = Connection::open_with_flags(uri, flags)?;
        Ok(conn)
    }

    /// Attach a standalone translation DB file and register it for routing under
    /// `global_id`. The file's own translation id and display metadata are read
    /// back from it (the file is the source of truth) and returned.
    ///
    /// The file is attached read-only via an `immutable=1` URI: downloaded
    /// translation files never change after install, so this skips the -wal/-shm
    /// sidecars and file locking, and works even if the file sits in a read-only
    /// location.
    pub fn attach_translation(
        &self,
        global_id: i64,
        path: &Path,
    ) -> Result<AttachedInfo, BibleError> {
        let alias = alias_for(global_id);
        let uri = format!("file:{}?immutable=1", encode_uri_path(path));

        let info = {
            let conn = self
                .conn
                .lock()
                .map_err(|e| BibleError::Internal(e.to_string()))?;
            // ATTACH's filename is an expression, so it can be bound. The alias
            // is our own `ext_<digits>` identifier (never user input) and safe
            // to interpolate — SQLite forbids binding a schema name.
            conn.execute(
                &format!("ATTACH DATABASE ?1 AS {alias}"),
                rusqlite::params![uri],
            )?;

            let read = conn.query_row(
                &format!(
                    "SELECT id, abbreviation, title, language, is_copyrighted \
                     FROM {alias}.translations ORDER BY id LIMIT 1"
                ),
                [],
                |row| {
                    Ok(AttachedInfo {
                        local_id: row.get(0)?,
                        abbreviation: row.get(1)?,
                        title: row.get(2)?,
                        language: row.get(3)?,
                        is_copyrighted: row.get(4)?,
                    })
                },
            );

            match read {
                Ok(info) => info,
                Err(e) => {
                    // Don't leak a half-attached alias if the file is malformed.
                    let _ = conn.execute_batch(&format!("DETACH DATABASE {alias}"));
                    return Err(BibleError::from(e));
                }
            }
        };

        let mut attached = self
            .attached
            .lock()
            .map_err(|e| BibleError::Internal(e.to_string()))?;
        attached.insert(
            global_id,
            AttachedSource {
                alias,
                local_id: info.local_id,
                abbreviation: info.abbreviation.clone(),
                title: info.title.clone(),
                language: info.language.clone(),
                is_copyrighted: info.is_copyrighted,
            },
        );
        Ok(info)
    }

    /// Detach a previously attached translation. A no-op if `global_id` isn't
    /// currently attached.
    pub fn detach_translation(&self, global_id: i64) -> Result<(), BibleError> {
        let alias = {
            let mut attached = self
                .attached
                .lock()
                .map_err(|e| BibleError::Internal(e.to_string()))?;
            match attached.remove(&global_id) {
                Some(src) => src.alias,
                None => return Ok(()),
            }
        };
        let conn = self
            .conn
            .lock()
            .map_err(|e| BibleError::Internal(e.to_string()))?;
        conn.execute_batch(&format!("DETACH DATABASE {alias}"))?;
        Ok(())
    }

    /// Resolve a global translation id to its physical location. Falls back to
    /// the main DB (with the global id used verbatim) when the id isn't
    /// attached — so bundled translations need no registry entry.
    pub(crate) fn route(&self, translation_id: i64) -> Route {
        let attached = self.attached.lock().unwrap();
        match attached.get(&translation_id) {
            Some(src) => Route {
                prefix: format!("{}.", src.alias),
                local_id: src.local_id,
                display_id: translation_id,
            },
            None => Route {
                prefix: String::new(),
                local_id: translation_id,
                display_id: translation_id,
            },
        }
    }

    /// The attached (downloaded) translations, as `Translation`-ready tuples.
    /// Used by `list_translations` to union downloads onto the bundled set.
    pub(crate) fn attached_translations(&self) -> Vec<crate::models::Translation> {
        let attached = self.attached.lock().unwrap();
        attached
            .iter()
            .map(|(global_id, src)| crate::models::Translation {
                id: *global_id,
                abbreviation: src.abbreviation.clone(),
                title: src.title.clone(),
                language: src.language.clone(),
                is_copyrighted: src.is_copyrighted,
                is_downloaded: true,
            })
            .collect()
    }
}

/// The SQL schema alias for a downloaded translation's attached file.
fn alias_for(global_id: i64) -> String {
    format!("ext_{global_id}")
}

/// Percent-encode a filesystem path for use in a `SQLite` `file:` URI.
///
/// Backslashes become forward slashes (Windows), and the characters that are
/// significant in a URI (`%`, space, `?`, `#`) are percent-encoded. `%` must be
/// escaped first so the escapes we introduce aren't double-encoded.
pub(crate) fn encode_uri_path(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('?', "%3f")
        .replace('#', "%23")
}
