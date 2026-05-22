use crate::database::productization::{hydrate_tags, list_tags_locked, row_to_productized_item};
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
const CURRENT_DB_VERSION: i64 = 2;

#[derive(Debug, Serialize, Deserialize)]
struct ExportFile {
    version: u32,
    exported_at: i64,
    items: Vec<ClipboardItem>,
    tags: Vec<Tag>,
}

pub fn export_json(db: &Database, path: &str) -> Result<BackupSummary, AppError> {
    let conn = db.get_connection()?;
    let mut items = load_all_items(&conn)?;
    hydrate_tags(&conn, &mut items)?;
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
    let mut items = load_all_items(&conn)?;
    hydrate_tags(&conn, &mut items)?;
    let mut out = String::from("id,content_type,preview,content,is_favorited,is_sensitive,sensitivity_reason,tags,created_at,last_used_at\n");
    for item in items {
        let tags = item
            .tags
            .iter()
            .map(|tag| tag.name.as_str())
            .collect::<Vec<_>>()
            .join("|");
        out.push_str(
            &[
                item.id.to_string(),
                csv_escape(item.content_type.as_str()),
                csv_escape(item.preview.as_deref().unwrap_or_default()),
                csv_escape(&item.content),
                item.is_favorited.to_string(),
                item.is_sensitive.to_string(),
                csv_escape(item.sensitivity_reason.as_deref().unwrap_or_default()),
                csv_escape(&tags),
                item.created_at.to_string(),
                item.last_used_at.to_string(),
            ]
            .join(","),
        );
        out.push('\n');
    }
    write_file(path, out.as_bytes())
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
    let data = std::fs::read_to_string(path)
        .map_err(|e| AppError::System(format!("failed to read import file: {}", e)))?;
    let mut items = Vec::new();
    for (record_no, record) in parse_csv_records(&data)?.into_iter().enumerate() {
        if record_no == 0 || record.trim().is_empty() {
            continue;
        }
        let fields = parse_csv_line(&record)?;
        if fields.len() < 10 {
            return Err(AppError::InvalidInput(format!(
                "CSV record {} has too few fields",
                record_no + 1
            )));
        }
        items.push(ClipboardItem {
            id: 0,
            content_type: parse_content_type(&fields[1]),
            preview: empty_to_none(&fields[2]),
            content: fields[3].clone(),
            hash: hash_content(&fields[1], &fields[3]),
            size: fields[3].len() as i64,
            metadata: None,
            is_favorited: fields[4] == "true",
            is_sensitive: fields[5] == "true",
            sensitivity_reason: empty_to_none(&fields[6]),
            tags: fields[7]
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
            created_at: fields[8].parse().unwrap_or_else(|_| now_millis()),
            last_used_at: fields[9].parse().unwrap_or_else(|_| now_millis()),
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
    let mut stmt = conn.prepare(
        "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited,
                created_at, last_used_at, is_sensitive, sensitivity_reason
         FROM clipboard_items
         ORDER BY last_used_at DESC, created_at DESC",
    )?;
    let items = stmt
        .query_map([], |row| Ok(row_to_productized_item(row)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(items)
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

fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn parse_csv_line(line: &str) -> Result<Vec<String>, AppError> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut chars = line.chars().peekable();
    let mut quoted = false;
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                fields.push(field);
                field = String::new();
            }
            _ => field.push(ch),
        }
    }
    if quoted {
        return Err(AppError::InvalidInput("unterminated CSV quote".into()));
    }
    fields.push(field);
    Ok(fields)
}

fn parse_csv_records(data: &str) -> Result<Vec<String>, AppError> {
    let mut records = Vec::new();
    let mut record = String::new();
    let mut chars = data.chars().peekable();
    let mut quoted = false;

    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => {
                record.push(ch);
                record.push(chars.next().unwrap());
            }
            '"' => {
                quoted = !quoted;
                record.push(ch);
            }
            '\r' if !quoted => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                records.push(std::mem::take(&mut record));
            }
            '\n' if !quoted => {
                records.push(std::mem::take(&mut record));
            }
            _ => record.push(ch),
        }
    }

    if quoted {
        return Err(AppError::InvalidInput("unterminated CSV quote".into()));
    }
    if !record.is_empty() {
        records.push(record);
    }

    Ok(records)
}

fn parse_content_type(value: &str) -> ContentType {
    match value {
        "image" => ContentType::Image,
        "file" => ContentType::File,
        _ => ContentType::Text,
    }
}

fn empty_to_none(value: &str) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
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

    if backup_version > CURRENT_DB_VERSION {
        return Err(AppError::InvalidInput(format!(
            "newer database schema version {} is not supported by this app version",
            backup_version
        )));
    }

    Ok(())
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
}
