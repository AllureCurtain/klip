use crate::AppError;
use rusqlite::{Connection, OptionalExtension};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

const DEFAULT_TOGGLE_HOTKEY: &str = "Ctrl+Alt+K";
const DEFAULT_QUICK_PASTE_PREFIX: &str = "Ctrl+Alt";
const DEFAULT_AUTO_START: &str = "false";

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, AppError> {
        match Self::open_initialized(path) {
            Ok(db) => Ok(db),
            Err(error) if path.exists() && is_recoverable_database_error(&error) => {
                let backup_path = preserve_corrupt_database(path)?;
                tracing::warn!(
                    "Recovered from corrupt database at {}; preserved original at {}",
                    path.display(),
                    backup_path.display()
                );
                Self::open_initialized(path).map_err(|recovery_error| {
                    AppError::Database(format!(
                        "failed to recreate database after preserving corrupt database at {}: {}; original error: {}",
                        backup_path.display(),
                        recovery_error,
                        error
                    ))
                })
            }
            Err(error) => Err(error),
        }
    }

    fn open_initialized(path: &Path) -> Result<Self, AppError> {
        let conn = Connection::open(path)?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn from_conn(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn init_schema(&self) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Database(format!("mutex poisoned: {}", e)))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                content_type    TEXT NOT NULL,
                content         TEXT NOT NULL,
                preview         TEXT,
                hash            TEXT NOT NULL UNIQUE,
                size            INTEGER NOT NULL DEFAULT 0,
                metadata        TEXT,
                is_favorited    INTEGER NOT NULL DEFAULT 0,
                created_at      INTEGER NOT NULL,
                last_used_at    INTEGER NOT NULL
            )",
            [],
        )?;

        let has_metadata: bool = conn
            .prepare("SELECT metadata FROM clipboard_items LIMIT 0")
            .map(|_| true)
            .unwrap_or(false);

        if !has_metadata {
            conn.execute("ALTER TABLE clipboard_items ADD COLUMN metadata TEXT", [])?;
        }

        add_column_if_missing(
            &conn,
            "clipboard_items",
            "is_sensitive",
            "INTEGER NOT NULL DEFAULT 0",
        )?;
        add_column_if_missing(&conn, "clipboard_items", "sensitivity_reason", "TEXT")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_created_at ON clipboard_items(created_at DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_last_used_created_at
             ON clipboard_items(last_used_at DESC, created_at DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_content_type ON clipboard_items(content_type)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_items(hash)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_preview ON clipboard_items(preview)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_favorite_last_used
             ON clipboard_items(is_favorited, last_used_at DESC, created_at DESC)",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_sensitive
             ON clipboard_items(is_sensitive, last_used_at DESC, created_at DESC)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS tags (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                color       TEXT,
                created_at  INTEGER NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_item_tags (
                item_id INTEGER NOT NULL,
                tag_id  INTEGER NOT NULL,
                PRIMARY KEY (item_id, tag_id),
                FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_item_tags_tag_id
             ON clipboard_item_tags(tag_id, item_id)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS snippets (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                title           TEXT NOT NULL,
                content         TEXT NOT NULL,
                tag_id          INTEGER,
                is_favorited    INTEGER NOT NULL DEFAULT 0,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_snippets_updated_at
             ON snippets(updated_at DESC)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_source_rules (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                match_type      TEXT NOT NULL,
                pattern         TEXT NOT NULL,
                enabled         INTEGER NOT NULL DEFAULT 1,
                created_at      INTEGER NOT NULL,
                updated_at      INTEGER NOT NULL
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_source_rules_enabled
             ON clipboard_source_rules(enabled, match_type)",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_config (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  INTEGER NOT NULL
            )",
            [],
        )?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let defaults = [
            ("max_history_count", "100"),
            ("hotkey_toggle_window", DEFAULT_TOGGLE_HOTKEY),
            ("hotkey_quick_paste_prefix", DEFAULT_QUICK_PASTE_PREFIX),
            ("auto_start", DEFAULT_AUTO_START),
            ("close_to_tray", "true"),
            ("show_in_tray", "true"),
            ("window_width", "560"),
            ("window_height", "760"),
            ("search_debounce_ms", "150"),
            ("language", "zh-CN"),
            ("sensitive_capture_policy", "flag"),
            ("mask_sensitive_previews", "true"),
            ("clipboard_monitor_enabled", "true"),
            ("privacy_mode_until", "0"),
            ("advanced_search_exact", "false"),
            ("updates_enabled", "false"),
            ("update_feed_url", ""),
            ("encryption_enabled", "false"),
            ("encryption_status", "off"),
            ("sync_folder", ""),
            ("plugin_folder", ""),
        ];

        for (key, value) in defaults {
            conn.execute(
                "INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
                [key, value, &now.to_string()],
            )?;
        }

        run_schema_migrations(&conn, now)?;

        Ok(())
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|e| AppError::Database(format!("mutex poisoned: {}", e)))
    }
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), AppError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let exists = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == column);

    if !exists {
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition),
            [],
        )?;
    }

    Ok(())
}

fn is_recoverable_database_error(error: &AppError) -> bool {
    let AppError::Database(message) = error else {
        return false;
    };

    message.contains("file is not a database")
        || message.contains("database disk image is malformed")
}

fn preserve_corrupt_database(path: &Path) -> Result<PathBuf, AppError> {
    let backup_path = next_corrupt_backup_path(path);
    std::fs::rename(path, &backup_path).map_err(|e| {
        AppError::System(format!(
            "failed to preserve corrupt database at {}: {}",
            backup_path.display(),
            e
        ))
    })?;
    Ok(backup_path)
}

fn next_corrupt_backup_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("klip.db");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    path.with_file_name(format!("{}.corrupt-{}.bak", file_name, now))
}

pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    #[cfg(target_os = "linux")]
    let app_data_dir = crate::platform::linux::data_dir();

    #[cfg(not(target_os = "linux"))]
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::System(format!("failed to resolve app data dir: {}", e)))?;

    #[cfg(target_os = "linux")]
    let _ = app_handle;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| AppError::System(format!("failed to create app data dir: {}", e)))?;

    Ok(app_data_dir.join("klip.db"))
}

pub fn init(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let db_path = get_db_path(&app_handle)?;
    let db = Database::new(&db_path)?;
    app_handle.manage(db);
    Ok(())
}

fn migrate_window_size_defaults(conn: &Connection, now: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config
         SET value = '560', updated_at = ?1
         WHERE key = 'window_width' AND value IN ('400', '480')",
        [&now.to_string()],
    )?;

    conn.execute(
        "UPDATE app_config
         SET value = '760', updated_at = ?1
         WHERE key = 'window_height' AND value IN ('600', '720')",
        [&now.to_string()],
    )?;

    Ok(())
}

fn normalize_legacy_hotkey_config(conn: &Connection, now: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config
         SET value = ?1, updated_at = ?2
         WHERE key = 'hotkey_toggle_window'
           AND value = 'CommandOrControl+Shift+V'",
        [DEFAULT_TOGGLE_HOTKEY, &now.to_string()],
    )?;

    conn.execute(
        "UPDATE app_config
         SET value = ?1, updated_at = ?2
         WHERE key = 'hotkey_quick_paste_prefix'
           AND value = 'CommandOrControl+Shift'",
        [DEFAULT_QUICK_PASTE_PREFIX, &now.to_string()],
    )?;

    Ok(())
}

fn run_schema_migrations(conn: &Connection, now: i64) -> Result<(), AppError> {
    let stored_version = read_schema_version(conn)?;
    if stored_version > crate::database::CURRENT_DB_VERSION {
        return Err(AppError::Database(format!(
            "newer database schema version {} is not supported by this app version",
            stored_version
        )));
    }

    if stored_version < 2 {
        migrate_to_v2(conn, now)?;
    }

    if stored_version < 3 {
        migrate_to_v3(conn, now)?;
    }

    write_schema_version(conn, now, crate::database::CURRENT_DB_VERSION)
}

fn read_schema_version(conn: &Connection) -> Result<i64, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'db_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;

    value
        .as_deref()
        .unwrap_or("0")
        .parse::<i64>()
        .map_err(|e| AppError::Database(format!("invalid database schema version: {}", e)))
}

fn write_schema_version(conn: &Connection, now: i64, version: i64) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO app_config (key, value, updated_at)
         VALUES ('db_version', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        rusqlite::params![version.to_string(), now],
    )?;
    Ok(())
}

fn migrate_to_v2(conn: &Connection, now: i64) -> Result<(), AppError> {
    normalize_legacy_hotkey_config(conn, now)?;
    migrate_window_size_defaults(conn, now)?;
    Ok(())
}

fn migrate_to_v3(conn: &Connection, now: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE app_config SET value = '560', updated_at = ?1
         WHERE key = 'window_width' AND CAST(value AS INTEGER) <= 480",
        [&now.to_string()],
    )?;
    conn.execute(
        "UPDATE app_config SET value = '760', updated_at = ?1
         WHERE key = 'window_height' AND CAST(value AS INTEGER) <= 720",
        [&now.to_string()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Database;
    use crate::AppError;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let dir = std::env::temp_dir().join(format!("klip-connection-{}-{}", name, now));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn default_hotkey_config_matches_runtime_contract() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let toggle = crate::database::config::get(&db, "hotkey_toggle_window")
            .unwrap()
            .unwrap();
        let prefix = crate::database::config::get(&db, "hotkey_quick_paste_prefix")
            .unwrap()
            .unwrap();

        assert_eq!(toggle, "Ctrl+Alt+K");
        assert_eq!(prefix, "Ctrl+Alt");
    }

    #[test]
    fn legacy_hotkey_config_is_normalized_to_runtime_defaults() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES
                 ('hotkey_toggle_window', 'CommandOrControl+Shift+V', 1),
                 ('hotkey_quick_paste_prefix', 'CommandOrControl+Shift', 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let toggle = crate::database::config::get(&db, "hotkey_toggle_window")
            .unwrap()
            .unwrap();
        let prefix = crate::database::config::get(&db, "hotkey_quick_paste_prefix")
            .unwrap()
            .unwrap();

        assert_eq!(toggle, "Ctrl+Alt+K");
        assert_eq!(prefix, "Ctrl+Alt");
    }

    #[test]
    fn default_autostart_config_is_disabled() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let auto_start = crate::database::config::get(&db, "auto_start")
            .unwrap()
            .unwrap();

        assert_eq!(auto_start, "false");
    }

    #[test]
    fn persisted_autostart_enabled_value_survives_schema_init() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES
                 ('auto_start', 'true', 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let auto_start = crate::database::config::get(&db, "auto_start")
            .unwrap()
            .unwrap();

        assert_eq!(auto_start, "true");
    }

    #[test]
    fn legacy_db_version_is_upgraded_to_current_schema_version() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES
                 ('db_version', '1', 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let version = crate::database::config::get(&db, "db_version")
            .unwrap()
            .unwrap();

        assert_eq!(version, "3");
    }

    #[test]
    fn legacy_window_size_defaults_are_migrated_to_current_values() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES
                 ('db_version', '1', 1),
                 ('window_width', '400', 1),
                 ('window_height', '600', 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let width = crate::database::config::get(&db, "window_width")
            .unwrap()
            .unwrap();
        let height = crate::database::config::get(&db, "window_height")
            .unwrap()
            .unwrap();

        assert_eq!(width, "560");
        assert_eq!(height, "760");
    }

    #[test]
    fn newer_db_version_is_rejected_instead_of_silently_downgrading() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES
                 ('db_version', '999', 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        let result = db.init_schema();

        assert!(matches!(
            result,
            Err(AppError::Database(message)) if message.contains("newer database schema")
        ));
    }

    #[test]
    fn corrupt_database_file_is_preserved_and_replaced_with_empty_schema() {
        let dir = temp_dir("corrupt-recovery");
        let db_path = dir.join("klip.db");
        std::fs::write(&db_path, b"not sqlite").unwrap();

        let db = Database::new(&db_path).unwrap();

        let version = crate::database::config::get(&db, "db_version")
            .unwrap()
            .unwrap();
        assert_eq!(version, "3");
        drop(db);

        let backups = std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| {
                        name.starts_with("klip.db.corrupt-") && name.ends_with(".bak")
                    })
            })
            .collect::<Vec<_>>();

        assert_eq!(backups.len(), 1);
        assert_eq!(std::fs::read(&backups[0]).unwrap(), b"not sqlite");
        let item_count: i64 = rusqlite::Connection::open(&db_path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(item_count, 0);
    }
}
