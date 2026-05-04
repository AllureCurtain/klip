use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &std::path::Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        // 创建剪贴板历史表
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
        )
        .map_err(|e| e.to_string())?;

        // 迁移：添加 metadata 列（如果不存在）
        let has_metadata: bool = conn
            .prepare("SELECT metadata FROM clipboard_items LIMIT 0")
            .map(|_| true)
            .unwrap_or(false);

        if !has_metadata {
            conn.execute("ALTER TABLE clipboard_items ADD COLUMN metadata TEXT", [])
                .map_err(|e| e.to_string())?;
        }

        // 创建索引
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_created_at ON clipboard_items(created_at DESC)",
            [],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_hash ON clipboard_items(hash)",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_preview ON clipboard_items(preview)",
            [],
        )
        .map_err(|e| e.to_string())?;

        // 创建配置表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_config (
                key         TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                updated_at  INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        // 初始化默认配置
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let defaults = [
            ("max_history_count", "100"),
            ("hotkey_toggle_window", "Ctrl+Alt+K"),
            ("hotkey_quick_paste_prefix", "Ctrl+Alt"),
            ("auto_start", "true"),
            ("close_to_tray", "true"),
            ("show_in_tray", "true"),
            ("window_width", "400"),
            ("window_height", "600"),
            ("search_debounce_ms", "150"),
            ("db_version", "2"),
        ];

        for (key, value) in defaults {
            conn.execute(
                "INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
                [key, value, &now.to_string()],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    pub fn get_connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|e| e.to_string())
    }
}

pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    Ok(app_data_dir.join("klip.db"))
}

pub fn init(app_handle: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let db = Database::new(&db_path)?;
    app_handle.manage(db);
    Ok(())
}
