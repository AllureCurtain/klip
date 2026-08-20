use crate::AppError;
use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::Manager;

pub struct Database {
    conn: Mutex<Connection>,
    search_index: Option<Arc<crate::search::SearchIndex>>,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self, AppError> {
        let migration_backup = create_pre_migration_backup_if_needed(path)?;
        match Self::open_initialized(path) {
            Ok(db) => Ok(db),
            Err(error) if migration_backup.is_some() => {
                let backup_path = migration_backup.expect("checked above");
                restore_pre_migration_backup(path, &backup_path)?;
                Err(AppError::Database(format!(
                    "database migration failed and the pre-migration backup was restored from {}: {}",
                    backup_path.display(),
                    error
                )))
            }
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

        let mut db = Self {
            conn: Mutex::new(conn),
            search_index: None,
        };
        db.init_schema()?;

        let index_dir = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(crate::search::INDEX_DIRECTORY_NAME);
        match crate::search::open_shared(&index_dir, &db) {
            Ok(index) => db.search_index = Some(index),
            Err(error) => tracing::warn!(
                "Full-text search unavailable at {}: {}; SQLite LIKE fallback remains active",
                index_dir.display(),
                error
            ),
        }
        Ok(db)
    }

    #[cfg(test)]
    pub fn from_conn(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
            search_index: None,
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
        let is_new_install = conn.query_row(
            "SELECT NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_config')",
            [],
            |row| row.get::<_, bool>(0),
        )?;

        crate::database::schema::initialize_base_schema(&conn, now)?;
        crate::database::migrations::run_pending_migrations(&conn, now, is_new_install)?;

        Ok(())
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|e| AppError::Database(format!("mutex poisoned: {}", e)))
    }

    pub(crate) fn search_index(&self) -> Option<&Arc<crate::search::SearchIndex>> {
        self.search_index.as_ref()
    }
}

fn create_pre_migration_backup_if_needed(path: &Path) -> Result<Option<PathBuf>, AppError> {
    if !path.exists()
        || path
            .metadata()
            .map(|metadata| metadata.len() == 0)
            .unwrap_or(true)
    {
        return Ok(None);
    }
    let source = match Connection::open(path) {
        Ok(connection) => connection,
        Err(_) => return Ok(None),
    };
    let source_integrity =
        match source.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0)) {
            Ok(result) => result,
            Err(_) => return Ok(None),
        };
    if source_integrity != "ok" {
        return Ok(None);
    }
    let has_config = source
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'app_config')",
            [],
            |row| row.get::<_, bool>(0),
        )
        .unwrap_or(false);
    let stored_version = if has_config {
        source
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0)
    } else {
        0
    };
    if stored_version >= crate::database::CURRENT_DB_VERSION {
        return Ok(None);
    }

    let backup_path = next_pre_migration_backup_path(path);
    source
        .backup(rusqlite::DatabaseName::Main, &backup_path, None)
        .map_err(|error| {
            AppError::Database(format!(
                "failed to create pre-migration backup at {}: {}",
                backup_path.display(),
                error
            ))
        })?;
    let backup = Connection::open(&backup_path)?;
    let integrity: String = backup.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Database(format!(
            "pre-migration backup integrity check failed at {}: {}",
            backup_path.display(),
            integrity
        )));
    }
    tracing::info!(
        "Created database migration backup at {}",
        backup_path.display()
    );
    Ok(Some(backup_path))
}

fn restore_pre_migration_backup(path: &Path, backup_path: &Path) -> Result<(), AppError> {
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", path.display(), suffix));
        if sidecar.exists() {
            std::fs::remove_file(&sidecar).map_err(|error| {
                AppError::System(format!(
                    "failed to remove migration sidecar {}: {}",
                    sidecar.display(),
                    error
                ))
            })?;
        }
    }
    std::fs::copy(backup_path, path).map_err(|error| {
        AppError::System(format!(
            "failed to restore pre-migration backup {} to {}: {}",
            backup_path.display(),
            path.display(),
            error
        ))
    })?;
    Ok(())
}

fn next_pre_migration_backup_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("klip.db");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    path.with_file_name(format!("{}.pre-v8-{}.bak", file_name, now))
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
    use base64::Engine as _;
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

        assert_eq!(version, "8");
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
    fn v3_database_is_migrated_with_plain_text_formats() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE clipboard_items (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 content_type TEXT NOT NULL,
                 content TEXT NOT NULL,
                 preview TEXT,
                 hash TEXT NOT NULL UNIQUE,
                 size INTEGER NOT NULL DEFAULT 0,
                 metadata TEXT,
                 is_favorited INTEGER NOT NULL DEFAULT 0,
                 is_sensitive INTEGER NOT NULL DEFAULT 0,
                 sensitivity_reason TEXT,
                 created_at INTEGER NOT NULL,
                 last_used_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at)
             VALUES ('db_version', '3', 1);
             INSERT INTO clipboard_items
               (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES
               ('text', 'legacy text', 'legacy text', 'legacy-hash', 11, 1, 1),
               ('image', 'data:image/png;base64,AA==', 'legacy image', 'legacy-image-hash', 1, 2, 2);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let conn = db.get_connection().unwrap();
        let version: String = conn
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let format: (String, String) = conn
            .query_row(
                "SELECT format, content FROM clipboard_formats WHERE item_id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let image_ocr_status: String = conn
            .query_row(
                "SELECT status FROM clipboard_ocr WHERE item_id = 2",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(version, "8");
        assert_eq!(format, ("text".into(), "legacy text".into()));
        assert_eq!(image_ocr_status, "pending");
    }

    #[test]
    fn v4_database_is_migrated_with_pending_image_ocr() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        {
            let conn = db.get_connection().unwrap();
            conn.execute_batch(
                "DROP TABLE clipboard_ocr;
                 UPDATE app_config SET value = '4' WHERE key = 'db_version';
                 INSERT INTO clipboard_items
                   (content_type, content, preview, hash, size, created_at, last_used_at)
                 VALUES
                   ('image', 'data:image/png;base64,AA==', 'v4 image', 'v4-image-hash', 1, 2, 2);",
            )
            .unwrap();
        }

        db.init_schema().unwrap();

        let conn = db.get_connection().unwrap();
        let version: String = conn
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let status: String = conn
            .query_row(
                "SELECT status FROM clipboard_ocr WHERE item_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(version, "8");
        assert_eq!(status, "pending");
    }

    #[test]
    fn v5_database_is_migrated_with_empty_source_attribution() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE clipboard_items (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 content_type TEXT NOT NULL,
                 content TEXT NOT NULL,
                 preview TEXT,
                 hash TEXT NOT NULL UNIQUE,
                 size INTEGER NOT NULL DEFAULT 0,
                 metadata TEXT,
                 is_favorited INTEGER NOT NULL DEFAULT 0,
                 is_sensitive INTEGER NOT NULL DEFAULT 0,
                 sensitivity_reason TEXT,
                 created_at INTEGER NOT NULL,
                 last_used_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES ('db_version', '5', 1);
             INSERT INTO clipboard_items
               (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES ('text', 'v5 text', 'v5 text', 'v5-hash', 7, 1, 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let conn = db.get_connection().unwrap();
        let version: String = conn
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let source: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT source_application, source_window_title FROM clipboard_items WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(version, "8");
        assert_eq!(source, (None, None));
    }

    #[test]
    fn v6_database_is_migrated_with_empty_annotations() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE app_config (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE clipboard_items (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 content_type TEXT NOT NULL,
                 content TEXT NOT NULL,
                 preview TEXT,
                 hash TEXT NOT NULL UNIQUE,
                 size INTEGER NOT NULL DEFAULT 0,
                 metadata TEXT,
                 source_application TEXT,
                 source_window_title TEXT,
                 is_favorited INTEGER NOT NULL DEFAULT 0,
                 is_sensitive INTEGER NOT NULL DEFAULT 0,
                 sensitivity_reason TEXT,
                 created_at INTEGER NOT NULL,
                 last_used_at INTEGER NOT NULL
             );
             INSERT INTO app_config (key, value, updated_at) VALUES ('db_version', '6', 1);
             INSERT INTO clipboard_items
               (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES ('text', 'v6 text', 'v6 text', 'v6-hash', 7, 1, 1);",
        )
        .unwrap();

        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let conn = db.get_connection().unwrap();
        let version: String = conn
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let annotations: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT custom_title, note FROM clipboard_items WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();

        assert_eq!(version, "8");
        assert_eq!(annotations, (None, None));
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
        assert_eq!(version, "8");
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

    fn v7_connection() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::database::schema::initialize_base_schema(&conn, 1).unwrap();
        conn.execute(
            "INSERT INTO app_config (key, value, updated_at) VALUES ('db_version', '7', 1)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn new_install_seeds_safe_shortcut_defaults() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let bindings = crate::database::productization::list_shortcut_bindings(&db).unwrap();
        assert_eq!(bindings.len(), 10);
        assert!(bindings[0].enabled);
        assert_eq!(bindings[0].accelerator.as_deref(), Some("Ctrl+Alt+K"));
        assert!(bindings[1..].iter().all(|binding| !binding.enabled));
    }

    #[test]
    fn v7_upgrade_preserves_legacy_quick_paste_behavior() {
        let db = Database::from_conn(v7_connection());
        db.init_schema().unwrap();

        let bindings = crate::database::productization::list_shortcut_bindings(&db).unwrap();
        assert!(bindings.iter().all(|binding| binding.enabled));
        assert_eq!(bindings[9].accelerator.as_deref(), Some("Ctrl+Alt+9"));
    }

    #[test]
    fn v7_default_window_size_upgrades_as_a_pair() {
        let conn = v7_connection();
        conn.execute(
            "UPDATE app_config SET value = '560' WHERE key = 'window_width'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE app_config SET value = '760' WHERE key = 'window_height'",
            [],
        )
        .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let state = crate::database::productization::get_window_state(&db, "main")
            .unwrap()
            .unwrap();
        assert_eq!((state.width_dip, state.height_dip), (680, 720));
    }

    #[test]
    fn v7_custom_window_size_is_not_partially_rewritten() {
        let conn = v7_connection();
        conn.execute(
            "UPDATE app_config SET value = '640' WHERE key = 'window_width'",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE app_config SET value = '760' WHERE key = 'window_height'",
            [],
        )
        .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();

        let state = crate::database::productization::get_window_state(&db, "main")
            .unwrap()
            .unwrap();
        assert_eq!((state.width_dip, state.height_dip), (640, 760));
    }

    #[test]
    fn v7_png_data_url_migrates_to_canonical_blob_and_isolated_thumbnail() {
        let conn = v7_connection();
        let png = include_bytes!("../../tests/fixtures/ocr/chinese-text.png");
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(png)
        );
        conn.execute(
            "INSERT INTO clipboard_items
             (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES ('image', ?1, 'legacy image', 'legacy-image-v7', ?2, 1, 1)",
            rusqlite::params![data_url, png.len() as i64],
        )
        .unwrap();
        let item_id = conn.last_insert_rowid();
        let db = Database::from_conn(conn);

        db.init_schema().unwrap();

        let conn = db.get_connection().unwrap();
        let (canonical, width, height, metadata): (Vec<u8>, i64, i64, String) = conn
            .query_row(
                "SELECT b.content, r.width, r.height, r.metadata
                 FROM clipboard_item_representations r
                 JOIN binary_blobs b ON b.sha256 = r.blob_sha256
                 WHERE r.item_id = ?1 AND r.role = 'canonical'",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        let decoded = image::load_from_memory(png).unwrap();
        assert_eq!(canonical, png);
        assert_eq!(
            (width, height),
            (decoded.width() as i64, decoded.height() as i64)
        );
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&metadata).unwrap()["legacyReencoded"],
            true
        );

        let (thumbnail, thumb_width, thumb_height): (Vec<u8>, i64, i64) = conn
            .query_row(
                "SELECT b.content, r.width, r.height
                 FROM clipboard_item_representations r
                 JOIN binary_blobs b ON b.sha256 = r.blob_sha256
                 WHERE r.item_id = ?1 AND r.role = 'thumbnail'",
                [item_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert!(thumb_width <= 192 && thumb_height <= 192);
        assert!(image::load_from_memory(&thumbnail).is_ok());
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM clipboard_item_representations WHERE item_id = ?1",
                [item_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
            2
        );
    }

    #[test]
    fn failed_v8_migration_restores_the_pre_migration_database() {
        let dir = temp_dir("v8-migration-rollback");
        let db_path = dir.join("klip.db");
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        crate::database::schema::initialize_base_schema(&conn, 1).unwrap();
        conn.execute(
            "INSERT INTO app_config (key, value, updated_at) VALUES ('db_version', '7', 1)",
            [],
        )
        .unwrap();
        conn.execute_batch(
            "CREATE TRIGGER fail_v8_shortcuts
             BEFORE INSERT ON shortcut_bindings
             BEGIN SELECT RAISE(ABORT, 'injected v8 migration failure'); END;",
        )
        .unwrap();
        drop(conn);

        let error = Database::new(&db_path).err().expect("migration must fail");
        assert!(error.to_string().contains("backup was restored"));

        let restored = rusqlite::Connection::open(&db_path).unwrap();
        let version: String = restored
            .query_row(
                "SELECT value FROM app_config WHERE key = 'db_version'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, "7");
        let backups = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".pre-v8-"))
            .count();
        assert_eq!(backups, 1);
    }
}
