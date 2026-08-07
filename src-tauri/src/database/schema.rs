use crate::config::registry;
use crate::AppError;
use rusqlite::Connection;

pub fn initialize_base_schema(conn: &Connection, now: i64) -> Result<(), AppError> {
    create_clipboard_tables(conn)?;
    create_tag_tables(conn)?;
    create_snippet_tables(conn)?;
    create_source_rule_tables(conn)?;
    create_config_table(conn)?;
    seed_config_defaults(conn, now)?;
    Ok(())
}

fn create_clipboard_tables(conn: &Connection) -> Result<(), AppError> {
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

    let has_metadata = conn
        .prepare("SELECT metadata FROM clipboard_items LIMIT 0")
        .map(|_| true)
        .unwrap_or(false);

    if !has_metadata {
        conn.execute("ALTER TABLE clipboard_items ADD COLUMN metadata TEXT", [])?;
    }

    add_column_if_missing(
        conn,
        "clipboard_items",
        "is_sensitive",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    add_column_if_missing(conn, "clipboard_items", "sensitivity_reason", "TEXT")?;
    add_clipboard_source_columns(conn)?;
    add_clipboard_annotation_columns(conn)?;

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

    create_clipboard_format_table(conn)?;
    create_clipboard_ocr_table(conn)?;

    Ok(())
}

pub(crate) fn add_clipboard_source_columns(conn: &Connection) -> Result<(), AppError> {
    add_column_if_missing(conn, "clipboard_items", "source_application", "TEXT")?;
    add_column_if_missing(conn, "clipboard_items", "source_window_title", "TEXT")?;
    Ok(())
}

pub(crate) fn add_clipboard_annotation_columns(conn: &Connection) -> Result<(), AppError> {
    add_column_if_missing(conn, "clipboard_items", "custom_title", "TEXT")?;
    add_column_if_missing(conn, "clipboard_items", "note", "TEXT")?;
    Ok(())
}

pub(crate) fn create_clipboard_format_table(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_formats (
            item_id INTEGER NOT NULL,
            format  TEXT NOT NULL,
            content TEXT NOT NULL,
            PRIMARY KEY (item_id, format),
            FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_formats_format
         ON clipboard_formats(format, item_id)",
        [],
    )?;
    Ok(())
}

pub(crate) fn create_clipboard_ocr_table(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_ocr (
            item_id    INTEGER PRIMARY KEY,
            status     TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
            text       TEXT NOT NULL DEFAULT '',
            error      TEXT,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_clipboard_ocr_status
         ON clipboard_ocr(status, updated_at)",
        [],
    )?;
    Ok(())
}

fn create_tag_tables(conn: &Connection) -> Result<(), AppError> {
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
    Ok(())
}

fn create_snippet_tables(conn: &Connection) -> Result<(), AppError> {
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
    Ok(())
}

fn create_source_rule_tables(conn: &Connection) -> Result<(), AppError> {
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
    Ok(())
}

fn create_config_table(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  INTEGER NOT NULL
        )",
        [],
    )?;
    Ok(())
}

fn seed_config_defaults(conn: &Connection, now: i64) -> Result<(), AppError> {
    for (key, value) in registry::default_entries() {
        conn.execute(
            "INSERT OR IGNORE INTO app_config (key, value, updated_at) VALUES (?1, ?2, ?3)",
            [key, value, &now.to_string()],
        )?;
    }
    Ok(())
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
