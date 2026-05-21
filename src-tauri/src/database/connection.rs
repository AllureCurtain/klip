use crate::AppError;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

const DEFAULT_TOGGLE_HOTKEY: &str = "Ctrl+Alt+K";
const DEFAULT_QUICK_PASTE_PREFIX: &str = "Ctrl+Alt";
const DEFAULT_AUTO_START: &str = "false";

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self, AppError> {
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
            ("window_width", "480"),
            ("window_height", "720"),
            ("search_debounce_ms", "150"),
            ("language", "zh-CN"),
            ("db_version", "2"),
        ];

        for (key, value) in defaults {
            conn.execute(
                "INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
                [key, value, &now.to_string()],
            )?;
        }

        normalize_legacy_hotkey_config(&conn, now)?;
        migrate_window_size_defaults(&conn, now)?;

        Ok(())
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|e| AppError::Database(format!("mutex poisoned: {}", e)))
    }
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
         SET value = '480', updated_at = ?1
         WHERE key = 'window_width' AND value = '400'",
        [&now.to_string()],
    )?;

    conn.execute(
        "UPDATE app_config
         SET value = '720', updated_at = ?1
         WHERE key = 'window_height' AND value = '600'",
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

#[cfg(test)]
mod tests {
    use super::Database;

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
}
