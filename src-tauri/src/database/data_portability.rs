use crate::database::clipboard_query::{self, ClipboardQuerySpec};
use crate::database::productization::list_tags_locked;
use crate::database::types::{
    BackupSummary, ClipboardItem, ContentType, ImportSummary, RestoreSummary, Tag,
};
use crate::{AppError, Database};
use base64::Engine;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::path::{Path, PathBuf};

const SUPPORTED_EXPORT_VERSION: u32 = 1;
const CSV_HEADERS: [&str; 10] = [
    "id",
    "content_type",
    "preview",
    "content",
    "is_favorited",
    "is_sensitive",
    "sensitivity_reason",
    "tags",
    "created_at",
    "last_used_at",
];

#[derive(Debug, Serialize, Deserialize)]
struct ExportFile {
    version: u32,
    exported_at: i64,
    items: Vec<ClipboardItem>,
    tags: Vec<Tag>,
}

#[derive(Debug, Deserialize, Serialize)]
struct ClipboardCsvRow {
    id: i64,
    content_type: String,
    preview: String,
    content: String,
    is_favorited: bool,
    is_sensitive: bool,
    sensitivity_reason: String,
    tags: String,
    created_at: i64,
    last_used_at: i64,
}

pub fn export_json(db: &Database, path: &str) -> Result<BackupSummary, AppError> {
    let conn = db.get_connection()?;
    let items = load_all_items(&conn)?;
    let tags = list_tags_locked(&conn)?;
    let payload = ExportFile {
        version: SUPPORTED_EXPORT_VERSION,
        exported_at: now_millis(),
        items,
        tags,
    };
    let data = serde_json::to_vec_pretty(&payload)
        .map_err(|e| AppError::System(format!("failed to serialize export: {}", e)))?;
    write_file(path, &data)
}

pub fn export_csv(db: &Database, path: &str) -> Result<BackupSummary, AppError> {
    let conn = db.get_connection()?;
    let items = load_all_items(&conn)?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(Vec::new());
    writer.write_record(CSV_HEADERS).map_err(csv_error)?;
    for item in items {
        let tags = item
            .tags
            .iter()
            .map(|tag| tag.name.as_str())
            .collect::<Vec<_>>()
            .join("|");
        writer
            .serialize(ClipboardCsvRow {
                id: item.id,
                content_type: item.content_type.as_str().to_string(),
                preview: item.preview.unwrap_or_default(),
                content: item.content,
                is_favorited: item.is_favorited,
                is_sensitive: item.is_sensitive,
                sensitivity_reason: item.sensitivity_reason.unwrap_or_default(),
                tags,
                created_at: item.created_at,
                last_used_at: item.last_used_at,
            })
            .map_err(csv_error)?;
    }
    let data = writer
        .into_inner()
        .map_err(|e| csv_error(e.into_error().into()))?;
    write_file(path, &data)
}

pub fn import_json(db: &Database, path: &str) -> Result<ImportSummary, AppError> {
    let data = std::fs::read_to_string(path)
        .map_err(|e| AppError::System(format!("failed to read import file: {}", e)))?;
    let payload: ExportFile = serde_json::from_str(&data)
        .map_err(|e| AppError::InvalidInput(format!("invalid JSON import: {}", e)))?;
    if payload.version != SUPPORTED_EXPORT_VERSION {
        return Err(AppError::InvalidInput(format!(
            "unsupported JSON export version: {}",
            payload.version
        )));
    }
    import_items(db, payload.items)
}

pub fn import_csv(db: &Database, path: &str) -> Result<ImportSummary, AppError> {
    let data = std::fs::read(path)
        .map_err(|e| AppError::System(format!("failed to read import file: {}", e)))?;
    let mut reader = csv::ReaderBuilder::new()
        .flexible(false)
        .from_reader(data.as_slice());
    validate_csv_headers(reader.headers().map_err(csv_error)?)?;
    let mut items = Vec::new();
    for result in reader.deserialize::<ClipboardCsvRow>() {
        let row = result.map_err(csv_error)?;
        items.push(ClipboardItem {
            id: 0,
            content_type: ContentType::from_db(&row.content_type),
            preview: empty_to_none(&row.preview),
            content: row.content.clone(),
            hash: hash_content(&row.content_type, &row.content),
            size: row.content.len() as i64,
            metadata: None,
            is_favorited: row.is_favorited,
            is_sensitive: row.is_sensitive,
            sensitivity_reason: empty_to_none(&row.sensitivity_reason),
            tags: row
                .tags
                .split('|')
                .filter_map(|name| {
                    let trimmed = name.trim();
                    (!trimmed.is_empty()).then(|| Tag {
                        id: 0,
                        name: trimmed.to_string(),
                        color: None,
                        created_at: now_millis(),
                    })
                })
                .collect(),
            created_at: row.created_at,
            last_used_at: row.last_used_at,
        });
    }
    import_items(db, items)
}

pub fn backup_database(db: &Database, output_path: &str) -> Result<BackupSummary, AppError> {
    let output = Path::new(output_path);
    if output.exists() {
        std::fs::remove_file(output)
            .map_err(|e| AppError::System(format!("failed to replace backup: {}", e)))?;
    }
    if let Some(parent) = output
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::System(format!("failed to create backup directory: {}", e)))?;
    }

    let conn = db.get_connection()?;
    conn.execute_batch(&format!(
        "VACUUM main INTO '{}'",
        escape_sql_literal(output_path)
    ))?;
    let size = std::fs::metadata(output)
        .map_err(|e| AppError::System(format!("failed to inspect backup: {}", e)))?
        .len();
    Ok(BackupSummary {
        path: output_path.to_string(),
        size,
    })
}

pub fn restore_database(
    db: &Database,
    db_path: &Path,
    input_path: &str,
) -> Result<RestoreSummary, AppError> {
    let input = Path::new(input_path);
    validate_backup_database(input)?;

    let pre_restore_backup_path = pre_restore_backup_path(db_path);
    let pre_restore_backup_path_str = pre_restore_backup_path.to_string_lossy().to_string();
    let pre_restore_backup_size = backup_database(db, &pre_restore_backup_path_str)?.size;
    restore_from_attached_database(db, input_path)?;

    let size = std::fs::metadata(input)
        .map_err(|e| AppError::System(format!("failed to inspect restore source: {}", e)))?
        .len();

    Ok(RestoreSummary {
        path: db_path.to_string_lossy().to_string(),
        size,
        pre_restore_backup_path: pre_restore_backup_path_str,
        pre_restore_backup_size,
    })
}

fn import_items(db: &Database, items: Vec<ClipboardItem>) -> Result<ImportSummary, AppError> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let mut imported = 0;
    let mut skipped = 0;
    for item in items {
        let hash = if item.hash.is_empty() {
            hash_content(item.content_type.as_str(), &item.content)
        } else {
            item.hash.clone()
        };
        let result = tx.execute(
            "INSERT OR IGNORE INTO clipboard_items
             (content_type, content, preview, hash, size, metadata, is_favorited,
              is_sensitive, sensitivity_reason, created_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                item.content_type.as_str(),
                item.content,
                item.preview,
                hash,
                item.size,
                item.metadata,
                item.is_favorited as i64,
                item.is_sensitive as i64,
                item.sensitivity_reason,
                item.created_at,
                item.last_used_at,
            ],
        )?;
        if result == 0 {
            skipped += 1;
        } else {
            imported += 1;
        }
        let item_id: i64 = tx.query_row(
            "SELECT id FROM clipboard_items WHERE hash = ?1",
            [&hash],
            |row| row.get(0),
        )?;
        for tag in item.tags {
            let tag_id = upsert_import_tag(&tx, &tag)?;
            tx.execute(
                "INSERT OR IGNORE INTO clipboard_item_tags (item_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![item_id, tag_id],
            )?;
        }
    }
    tx.commit()?;
    Ok(ImportSummary { imported, skipped })
}

fn upsert_import_tag(tx: &rusqlite::Transaction<'_>, tag: &Tag) -> Result<i64, AppError> {
    let name = tag.name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput("tag name cannot be empty".into()));
    }
    tx.execute(
        "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET color = COALESCE(excluded.color, tags.color)",
        rusqlite::params![name, tag.color, tag.created_at],
    )?;
    Ok(
        tx.query_row("SELECT id FROM tags WHERE name = ?1", [name], |row| {
            row.get(0)
        })?,
    )
}

fn load_all_items(conn: &rusqlite::Connection) -> Result<Vec<ClipboardItem>, AppError> {
    let spec = ClipboardQuerySpec::all_items();
    clipboard_query::fetch_items_with_tags_locked(conn, &spec)
}

fn hash_content(content_type: &str, content: &str) -> String {
    let mut hasher = sha2::Sha256::new();
    hasher.update(content_type.as_bytes());
    hasher.update([0]);
    if content_type == "image" {
        if let Some(data) = content.strip_prefix("data:image/png;base64,") {
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(data) {
                hasher.update(decoded);
                return format!("{:x}", hasher.finalize());
            }
        }
    }
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn write_file(path: &str, data: &[u8]) -> Result<BackupSummary, AppError> {
    let output = Path::new(path);
    ensure_parent_dir(output)?;
    std::fs::write(path, data)
        .map_err(|e| AppError::System(format!("failed to write file: {}", e)))?;
    Ok(BackupSummary {
        path: path.to_string(),
        size: data.len() as u64,
    })
}

fn ensure_parent_dir(path: &Path) -> Result<(), AppError> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::System(format!("failed to create output directory: {}", e)))?;
    }
    Ok(())
}

fn empty_to_none(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn validate_csv_headers(headers: &csv::StringRecord) -> Result<(), AppError> {
    let actual = headers.iter().collect::<Vec<_>>();
    if actual != CSV_HEADERS {
        return Err(AppError::InvalidInput(format!(
            "CSV headers must be: {}",
            CSV_HEADERS.join(",")
        )));
    }
    Ok(())
}

fn csv_error(error: csv::Error) -> AppError {
    AppError::InvalidInput(format!("CSV error: {}", error))
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn escape_sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn validate_backup_database(path: &Path) -> Result<(), AppError> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?;
    if integrity != "ok" {
        return Err(AppError::InvalidInput(format!(
            "backup database integrity check failed: {}",
            integrity
        )));
    }

    let required_tables = [
        "clipboard_items",
        "app_config",
        "tags",
        "clipboard_item_tags",
    ];
    for table in required_tables {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table],
                |row| row.get(0),
            )
            .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?;
        if exists == 0 {
            return Err(AppError::InvalidInput(format!(
                "backup database is missing required table: {}",
                table
            )));
        }
    }

    require_table_columns(
        &conn,
        "clipboard_items",
        &[
            "id",
            "content_type",
            "content",
            "preview",
            "hash",
            "size",
            "metadata",
            "is_favorited",
            "created_at",
            "last_used_at",
            "is_sensitive",
            "sensitivity_reason",
        ],
    )?;
    require_table_columns(&conn, "tags", &["id", "name", "color", "created_at"])?;
    require_table_columns(&conn, "clipboard_item_tags", &["item_id", "tag_id"])?;
    require_table_columns(&conn, "app_config", &["key", "value", "updated_at"])?;

    let backup_version = conn
        .query_row(
            "SELECT value FROM app_config WHERE key = 'db_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?
        .unwrap_or_else(|| "0".to_string())
        .parse::<i64>()
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database version: {}", e)))?;

    if backup_version > crate::database::CURRENT_DB_VERSION {
        return Err(AppError::InvalidInput(format!(
            "newer database schema version {} is not supported by this app version",
            backup_version
        )));
    }

    Ok(())
}

fn require_table_columns(
    conn: &Connection,
    table: &str,
    required_columns: &[&str],
) -> Result<(), AppError> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({})", table))
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?;
    let existing = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?
        .collect::<Result<std::collections::HashSet<_>, _>>()
        .map_err(|e| AppError::InvalidInput(format!("invalid backup database: {}", e)))?;
    let missing = required_columns
        .iter()
        .filter(|column| !existing.contains(**column))
        .copied()
        .collect::<Vec<_>>();

    if missing.is_empty() {
        return Ok(());
    }

    Err(AppError::InvalidInput(format!(
        "backup database table {} is missing required columns: {}",
        table,
        missing.join(", ")
    )))
}

fn pre_restore_backup_path(db_path: &Path) -> PathBuf {
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("klip.db");
    db_path.with_file_name(format!("{}.pre-restore.bak", file_name))
}

fn restore_from_attached_database(db: &Database, input_path: &str) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{}' AS restore_db;",
        escape_sql_literal(input_path)
    ))?;

    let result = conn.execute_batch(
        "BEGIN IMMEDIATE;
         DELETE FROM clipboard_item_tags;
         DELETE FROM tags;
         DELETE FROM clipboard_items;
         DELETE FROM app_config;

         INSERT INTO clipboard_items
           (id, content_type, content, preview, hash, size, metadata, is_favorited,
            created_at, last_used_at, is_sensitive, sensitivity_reason)
         SELECT id, content_type, content, preview, hash, size, metadata, is_favorited,
            created_at, last_used_at, is_sensitive, sensitivity_reason
         FROM restore_db.clipboard_items;

         INSERT INTO tags (id, name, color, created_at)
         SELECT id, name, color, created_at FROM restore_db.tags;

         INSERT INTO clipboard_item_tags (item_id, tag_id)
         SELECT item_id, tag_id FROM restore_db.clipboard_item_tags;

         INSERT INTO app_config (key, value, updated_at)
         SELECT key, value, updated_at FROM restore_db.app_config;
         COMMIT;",
    );

    if let Err(error) = result {
        let _ = conn.execute_batch("ROLLBACK;");
        let _ = conn.execute_batch("DETACH DATABASE restore_db;");
        return Err(error.into());
    }

    conn.execute_batch("DETACH DATABASE restore_db;")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use rusqlite::Connection;
    use std::path::{Path, PathBuf};

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("klip-data-portability-{}-{}", name, now_millis()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn create_db(path: &Path) -> Database {
        Database::new(path).unwrap()
    }

    fn insert_text(db: &Database, content: &str) {
        let conn = db.get_connection().unwrap();
        conn.execute(
            "INSERT INTO clipboard_items
             (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES ('text', ?1, ?1, ?2, ?3, 1, 1)",
            rusqlite::params![content, format!("hash-{content}"), content.len() as i64],
        )
        .unwrap();
    }

    fn count_items(path: &Path) -> i64 {
        Connection::open(path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))
            .unwrap()
    }

    fn first_content(path: &Path) -> String {
        Connection::open(path)
            .unwrap()
            .query_row(
                "SELECT content FROM clipboard_items ORDER BY id LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn import_csv_preserves_multiline_content_fields() {
        let dir = temp_dir("csv-multiline");
        let db_path = dir.join("current.db");
        let csv_path = dir.join("items.csv");
        let db = create_db(&db_path);
        std::fs::write(
            &csv_path,
            "id,content_type,preview,content,is_favorited,is_sensitive,sensitivity_reason,tags,created_at,last_used_at\n1,text,preview,\"first line\nsecond line\",false,false,,notes,1,1\n",
        )
        .unwrap();

        let summary = import_csv(&db, csv_path.to_str().unwrap()).unwrap();

        assert_eq!(summary.imported, 1);
        assert_eq!(first_content(&db_path), "first line\nsecond line");
    }

    #[test]
    fn import_csv_preserves_quoted_commas_and_quotes() {
        let dir = temp_dir("csv-quotes");
        let db_path = dir.join("current.db");
        let csv_path = dir.join("items.csv");
        let db = create_db(&db_path);
        std::fs::write(
            &csv_path,
            "id,content_type,preview,content,is_favorited,is_sensitive,sensitivity_reason,tags,created_at,last_used_at\n1,text,\"hello, preview\",\"he said \"\"hello, team\"\"\",true,false,,work|quoted,1,1\n",
        )
        .unwrap();

        let summary = import_csv(&db, csv_path.to_str().unwrap()).unwrap();

        assert_eq!(summary.imported, 1);
        assert_eq!(first_content(&db_path), "he said \"hello, team\"");
    }

    #[test]
    fn import_csv_rejects_missing_required_headers() {
        let dir = temp_dir("csv-missing-header");
        let db_path = dir.join("current.db");
        let csv_path = dir.join("items.csv");
        let db = create_db(&db_path);
        std::fs::write(
            &csv_path,
            "id,content_type,preview,content,is_favorited,is_sensitive,sensitivity_reason,tags,created_at\n1,text,preview,content,false,false,,notes,1\n",
        )
        .unwrap();

        let result = import_csv(&db, csv_path.to_str().unwrap());

        assert!(matches!(
            result,
            Err(AppError::InvalidInput(message)) if message.contains("CSV headers")
        ));
        assert_eq!(count_items(&db_path), 0);
    }

    #[test]
    fn import_json_rejects_unsupported_export_versions() {
        let dir = temp_dir("json-version");
        let db_path = dir.join("current.db");
        let json_path = dir.join("items.json");
        let db = create_db(&db_path);
        std::fs::write(
            &json_path,
            r#"{"version":99,"exported_at":1,"items":[],"tags":[]}"#,
        )
        .unwrap();

        let result = import_json(&db, json_path.to_str().unwrap());

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        assert_eq!(count_items(&db_path), 0);
    }

    #[test]
    fn export_json_creates_parent_directories() {
        let dir = temp_dir("json-export-parent");
        let db_path = dir.join("current.db");
        let export_path = dir.join("nested").join("exports").join("items.json");
        let db = create_db(&db_path);
        insert_text(&db, "exported-item");

        let summary = export_json(&db, export_path.to_str().unwrap()).unwrap();

        assert!(export_path.exists());
        assert_eq!(summary.path, export_path.to_string_lossy());
        assert!(summary.size > 0);
    }

    #[test]
    fn restore_rejects_invalid_backup_without_overwriting_current_database() {
        let dir = temp_dir("invalid-restore");
        let current_path = dir.join("current.db");
        let backup_path = dir.join("invalid.db");
        let db = create_db(&current_path);
        insert_text(&db, "keep-current-data");
        std::fs::write(&backup_path, b"not sqlite").unwrap();

        let result = restore_database(&db, &current_path, backup_path.to_str().unwrap());

        assert!(result.is_err());
        assert_eq!(count_items(&current_path), 1);
    }

    #[test]
    fn restore_creates_pre_restore_backup_of_current_database() {
        let dir = temp_dir("pre-restore-backup");
        let current_path = dir.join("current.db");
        let restore_path = dir.join("restore.db");

        let current = create_db(&current_path);
        insert_text(&current, "current-item");

        let restore = create_db(&restore_path);
        insert_text(&restore, "restored-item");
        drop(restore);

        let summary =
            restore_database(&current, &current_path, restore_path.to_str().unwrap()).unwrap();

        assert_eq!(count_items(&current_path), 1);
        assert!(summary
            .pre_restore_backup_path
            .ends_with(".pre-restore.bak"));
        let backup_path = PathBuf::from(summary.pre_restore_backup_path);
        assert!(backup_path.exists());
        assert_eq!(count_items(&backup_path), 1);
    }

    #[test]
    fn restore_rejects_newer_backup_versions_without_overwriting_current_database() {
        let dir = temp_dir("newer-restore");
        let current_path = dir.join("current.db");
        let restore_path = dir.join("restore.db");

        let current = create_db(&current_path);
        insert_text(&current, "keep-current-data");

        let restore = create_db(&restore_path);
        {
            let conn = restore.get_connection().unwrap();
            conn.execute(
                "UPDATE app_config SET value = '999' WHERE key = 'db_version'",
                [],
            )
            .unwrap();
        }
        drop(restore);

        let result = restore_database(&current, &current_path, restore_path.to_str().unwrap());

        assert!(matches!(
            result,
            Err(AppError::InvalidInput(message)) if message.contains("newer database schema")
        ));
        assert_eq!(count_items(&current_path), 1);
    }

    #[test]
    fn restore_rejects_backup_missing_required_columns_before_mutating_current_database() {
        let dir = temp_dir("missing-columns-restore");
        let current_path = dir.join("current.db");
        let restore_path = dir.join("restore.db");

        let current = create_db(&current_path);
        insert_text(&current, "keep-current-data");

        let restore_conn = Connection::open(&restore_path).unwrap();
        restore_conn
            .execute_batch(
                "PRAGMA foreign_keys=ON;
                 CREATE TABLE clipboard_items (
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
                 );
                 CREATE TABLE tags (
                     id          INTEGER PRIMARY KEY AUTOINCREMENT,
                     name        TEXT NOT NULL UNIQUE,
                     color       TEXT,
                     created_at  INTEGER NOT NULL
                 );
                 CREATE TABLE clipboard_item_tags (
                     item_id INTEGER NOT NULL,
                     tag_id  INTEGER NOT NULL,
                     PRIMARY KEY (item_id, tag_id)
                 );
                 CREATE TABLE app_config (
                     key         TEXT PRIMARY KEY,
                     value       TEXT NOT NULL,
                     updated_at  INTEGER NOT NULL
                 );
                 INSERT INTO app_config (key, value, updated_at) VALUES ('db_version', '3', 1);",
            )
            .unwrap();
        drop(restore_conn);

        let result = restore_database(&current, &current_path, restore_path.to_str().unwrap());

        assert!(matches!(
            result,
            Err(AppError::InvalidInput(message))
                if message.contains("clipboard_items")
                    && message.contains("is_sensitive")
                    && message.contains("sensitivity_reason")
        ));
        assert_eq!(count_items(&current_path), 1);
        assert_eq!(first_content(&current_path), "keep-current-data");
    }
}
