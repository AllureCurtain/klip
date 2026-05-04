use rusqlite::OptionalExtension;

use base64::Engine;

use crate::database::types::ContentType;
use crate::Database;

use super::types::ClipboardItem;

pub fn get_list(db: &Database, limit: i64, offset: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([limit, offset], |row| Ok(row_to_clipboard_item(row)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn search(db: &Database, query: &str, limit: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE preview LIKE ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let search_pattern = format!("%{}%", query);
    let limit_str = limit.to_string();
    let items = stmt
        .query_map([&search_pattern, &limit_str], |row| {
            Ok(row_to_clipboard_item(row))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn get_by_id(db: &Database, id: i64) -> Result<Option<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([id], |row| Ok(row_to_clipboard_item(row)))
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub fn insert(
    db: &Database,
    item: &crate::database::types::NewClipboardItem,
) -> Result<ClipboardItem, String> {
    let conn = db.get_connection()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let content_str = match item.content_type {
        ContentType::Text => String::from_utf8_lossy(&item.data).to_string(),
        ContentType::Image => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&item.data)
        ),
        ContentType::File => String::from_utf8_lossy(&item.data).to_string(),
    };

    conn.execute(
        "INSERT INTO clipboard_items (content_type, content, preview, hash, size, metadata, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(hash) DO UPDATE SET last_used_at = excluded.last_used_at",
        rusqlite::params![
            item.content_type.as_str(),
            content_str,
            item.preview,
            item.hash,
            item.size,
            item.metadata,
            now,
            now,
        ],
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE hash = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([&item.hash], |row| Ok(row_to_clipboard_item(row)))
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub fn delete(db: &Database, id: i64) -> Result<(), String> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear(db: &Database) -> Result<(), String> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_items", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn cleanup_old_records(db: &Database, max_count: i64) -> Result<(), String> {
    let conn = db.get_connection()?;
    conn.execute(
        "DELETE FROM clipboard_items WHERE id NOT IN (
            SELECT id FROM clipboard_items ORDER BY created_at DESC LIMIT ?1
        )",
        [max_count],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn row_to_clipboard_item(row: &rusqlite::Row<'_>) -> ClipboardItem {
    let content_type_str: String = row.get(1).unwrap_or_default();
    let content_type = match content_type_str.as_str() {
        "image" => ContentType::Image,
        "file" => ContentType::File,
        _ => ContentType::Text,
    };
    ClipboardItem {
        id: row.get(0).unwrap_or(0),
        content_type,
        content: row.get(2).unwrap_or_default(),
        preview: row.get(3).unwrap_or(None),
        hash: row.get(4).unwrap_or_default(),
        size: row.get(5).unwrap_or(0),
        metadata: row.get(6).unwrap_or(None),
        is_favorited: row.get::<_, i64>(7).unwrap_or(0) != 0,
        created_at: row.get(8).unwrap_or(0),
        last_used_at: row.get(9).unwrap_or(0),
    }
}
