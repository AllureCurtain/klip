use crate::database::productization::{hydrate_tags, list_tags_locked, row_to_productized_item};
use crate::database::types::{BackupSummary, ClipboardItem, ContentType, ImportSummary, Tag};
use crate::{AppError, Database};
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::path::Path;

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
        version: 1,
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
    import_items(db, payload.items)
}

pub fn import_csv(db: &Database, path: &str) -> Result<ImportSummary, AppError> {
    let data = std::fs::read_to_string(path)
        .map_err(|e| AppError::System(format!("failed to read import file: {}", e)))?;
    let mut items = Vec::new();
    for (line_no, line) in data.lines().enumerate() {
        if line_no == 0 || line.trim().is_empty() {
            continue;
        }
        let fields = parse_csv_line(line)?;
        if fields.len() < 10 {
            return Err(AppError::InvalidInput(format!(
                "CSV line {} has too few fields",
                line_no + 1
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

pub fn restore_database(db_path: &Path, input_path: &str) -> Result<BackupSummary, AppError> {
    let data = std::fs::read(input_path)
        .map_err(|e| AppError::System(format!("failed to read backup: {}", e)))?;
    let size = data.len() as u64;
    std::fs::write(db_path, data)
        .map_err(|e| AppError::System(format!("failed to restore database: {}", e)))?;
    Ok(BackupSummary {
        path: db_path.to_string_lossy().to_string(),
        size,
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
    std::fs::write(path, data)
        .map_err(|e| AppError::System(format!("failed to write file: {}", e)))?;
    Ok(BackupSummary {
        path: path.to_string(),
        size: data.len() as u64,
    })
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
