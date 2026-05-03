use crate::database::types::ClipboardItem;
use crate::Database;
use rusqlite::OptionalExtension;
use std::time::SystemTime;

pub fn get_list(db: &Database, limit: i64, offset: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, is_favorited, created_at, last_used_at
             FROM clipboard_items
             ORDER BY created_at DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([limit, offset], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                hash: row.get(4)?,
                size: row.get(5)?,
                is_favorited: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

pub fn search(db: &Database, query: &str, limit: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, is_favorited, created_at, last_used_at
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
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                hash: row.get(4)?,
                size: row.get(5)?,
                is_favorited: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
            })
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
            "SELECT id, content_type, content, preview, hash, size, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([id], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                hash: row.get(4)?,
                size: row.get(5)?,
                is_favorited: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

pub fn insert(
    db: &Database,
    item: &crate::database::types::NewClipboardItem,
) -> Result<ClipboardItem, String> {
    let conn = db.get_connection()?;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    conn.execute(
        "INSERT INTO clipboard_items (content_type, content, preview, hash, size, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(hash) DO UPDATE SET last_used_at = excluded.last_used_at",
        [
            &item.content_type,
            &item.content,
            &item.preview.clone().unwrap_or_default(),
            &item.hash,
            &item.size.to_string(),
            &now.to_string(),
            &now.to_string(),
        ],
    ).map_err(|e| e.to_string())?;

    // 使用同一个连接查询插入的记录
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE hash = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([&item.hash], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                content_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                hash: row.get(4)?,
                size: row.get(5)?,
                is_favorited: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                last_used_at: row.get(8)?,
            })
        })
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
