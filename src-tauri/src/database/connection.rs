use crate::AppError;
use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

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
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        crate::database::schema::initialize_base_schema(&conn, now)?;
        crate::database::migrations::run_pending_migrations(&conn, now)?;

        Ok(())
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|e| AppError::Database(format!("mutex poisoned: {}", e)))
    }
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

pub const ENV_KLIP_DATA_DIR: &str = "KLIP_DATA_DIR";

pub fn app_data_dir_from_env() -> Option<PathBuf> {
    std::env::var_os(ENV_KLIP_DATA_DIR)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

pub fn app_data_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    if let Some(path) = app_data_dir_from_env() {
        return Ok(path);
    }

    #[cfg(target_os = "linux")]
    {
        let _ = app_handle;
        Ok(crate::platform::linux::data_dir())
    }

    #[cfg(not(target_os = "linux"))]
    {
        app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::System(format!("failed to resolve app data dir: {}", e)))
    }
}

pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, AppError> {
    let app_data_dir = app_data_dir(app_handle)?;

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
    fn app_data_dir_prefers_klip_data_dir_env_override() {
        let dir = temp_dir("env-data-dir");
        std::env::set_var(super::ENV_KLIP_DATA_DIR, &dir);

        let resolved = super::app_data_dir_from_env();

        std::env::remove_var(super::ENV_KLIP_DATA_DIR);
        assert_eq!(resolved, Some(dir));
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
