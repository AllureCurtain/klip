use crate::database::types::{ClipboardItem, ContentType, Tag};
use crate::{AppError, Database};
use rusqlite::OptionalExtension;

pub fn batch_delete(db: &Database, ids: &[i64]) -> Result<usize, AppError> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let mut count = 0;
    for id in ids {
        count += tx.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
    }
    tx.commit()?;
    Ok(count)
}

pub fn batch_set_favorite(
    db: &Database,
    ids: &[i64],
    is_favorited: bool,
) -> Result<usize, AppError> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let mut count = 0;
    for id in ids {
        count += tx.execute(
            "UPDATE clipboard_items SET is_favorited = ?1 WHERE id = ?2",
            rusqlite::params![is_favorited as i64, id],
        )?;
    }
    tx.commit()?;
    Ok(count)
}

pub fn get_list_filtered(
    db: &Database,
    limit: i64,
    offset: i64,
    content_type: Option<&str>,
    favorite_only: bool,
    tag_id: Option<i64>,
) -> Result<Vec<ClipboardItem>, AppError> {
    let conn = db.get_connection()?;
    let mut sql = select_sql();
    let mut filters: Vec<String> = Vec::new();
    if let Some(content_type) = content_type {
        filters.push(format!(
            "content_type = '{}'",
            escape_sql_literal(content_type)
        ));
    }
    if favorite_only {
        filters.push("is_favorited = 1".to_string());
    }
    if let Some(tag_id) = tag_id {
        filters.push(format!(
            "id IN (SELECT item_id FROM clipboard_item_tags WHERE tag_id = {})",
            tag_id
        ));
    }
    if !filters.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&filters.join(" AND "));
    }
    sql.push_str(" ORDER BY last_used_at DESC, created_at DESC LIMIT ?1 OFFSET ?2");

    let mut stmt = conn.prepare(&sql)?;
    let mut items = stmt
        .query_map(rusqlite::params![limit, offset], |row| {
            Ok(row_to_productized_item(row))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate_tags(&conn, &mut items)?;
    Ok(items)
}

pub fn search_filtered(
    db: &Database,
    query: &str,
    content_type: Option<&str>,
    favorite_only: bool,
    tag_id: Option<i64>,
    limit: i64,
    offset: i64,
) -> Result<Vec<ClipboardItem>, AppError> {
    let conn = db.get_connection()?;
    let mut sql = select_sql();
    let mut filters =
        vec!["(preview LIKE ?1 OR (content_type != 'image' AND content LIKE ?1))".to_string()];
    if let Some(content_type) = content_type {
        filters.push(format!(
            "content_type = '{}'",
            escape_sql_literal(content_type)
        ));
    }
    if favorite_only {
        filters.push("is_favorited = 1".to_string());
    }
    if let Some(tag_id) = tag_id {
        filters.push(format!(
            "id IN (SELECT item_id FROM clipboard_item_tags WHERE tag_id = {})",
            tag_id
        ));
    }
    sql.push_str(" WHERE ");
    sql.push_str(&filters.join(" AND "));
    sql.push_str(" ORDER BY last_used_at DESC, created_at DESC LIMIT ?2 OFFSET ?3");

    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(&sql)?;
    let mut items = stmt
        .query_map(rusqlite::params![pattern, limit, offset], |row| {
            Ok(row_to_productized_item(row))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    hydrate_tags(&conn, &mut items)?;
    Ok(items)
}

pub fn list_tags(db: &Database) -> Result<Vec<Tag>, AppError> {
    let conn = db.get_connection()?;
    let mut stmt =
        conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE")?;
    let tags = stmt
        .query_map([], tag_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

pub fn create_tag(db: &Database, name: &str, color: Option<&str>) -> Result<Tag, AppError> {
    let normalized = name.trim();
    if normalized.is_empty() {
        return Err(AppError::InvalidInput("tag name cannot be empty".into()));
    }
    let conn = db.get_connection()?;
    let now = now_millis();
    conn.execute(
        "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET color = excluded.color",
        rusqlite::params![normalized, color, now],
    )?;
    get_tag_by_name(&conn, normalized)
}

pub fn delete_tag(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    Ok(())
}

pub fn assign_tag(db: &Database, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute(
        "INSERT OR IGNORE INTO clipboard_item_tags (item_id, tag_id) VALUES (?1, ?2)",
        rusqlite::params![item_id, tag_id],
    )?;
    Ok(())
}

pub fn remove_tag(db: &Database, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute(
        "DELETE FROM clipboard_item_tags WHERE item_id = ?1 AND tag_id = ?2",
        rusqlite::params![item_id, tag_id],
    )?;
    Ok(())
}

pub fn rescan_sensitive(db: &Database) -> Result<usize, AppError> {
    let mut conn = db.get_connection()?;
    let rows = {
        let mut stmt = conn.prepare("SELECT id, content_type, content FROM clipboard_items")?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        rows
    };

    let tx = conn.transaction()?;
    let mut updated = 0;
    for (id, content_type, content) in rows {
        let detection = detect_sensitive(&content_type, &content);
        updated += tx.execute(
            "UPDATE clipboard_items
             SET is_sensitive = ?1, sensitivity_reason = ?2
             WHERE id = ?3",
            rusqlite::params![detection.is_some() as i64, detection.as_deref(), id],
        )?;
    }
    tx.commit()?;
    Ok(updated)
}

pub fn detect_sensitive(content_type: &str, content: &str) -> Option<String> {
    if content_type != "text" {
        return None;
    }
    let lower = content.to_ascii_lowercase();
    let secret_keys = [
        "password",
        "passwd",
        "api_key",
        "apikey",
        "secret",
        "access_token",
        "private_key",
    ];
    if secret_keys
        .iter()
        .any(|key| lower.contains(key) && (lower.contains('=') || lower.contains(':')))
    {
        return Some("credential keyword".into());
    }
    if content.contains("-----BEGIN ") && content.contains(" PRIVATE KEY-----") {
        return Some("private key block".into());
    }
    if has_long_token(content) {
        return Some("high-entropy token".into());
    }
    None
}

fn select_sql() -> String {
    "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited,
            created_at, last_used_at, is_sensitive, sensitivity_reason
     FROM clipboard_items"
        .to_string()
}

pub fn hydrate_tags(
    conn: &rusqlite::Connection,
    items: &mut [ClipboardItem],
) -> Result<(), AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color, t.created_at
         FROM tags t
         JOIN clipboard_item_tags it ON it.tag_id = t.id
         WHERE it.item_id = ?1
         ORDER BY t.name COLLATE NOCASE",
    )?;
    for item in items {
        item.tags = stmt
            .query_map([item.id], tag_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(())
}

pub fn list_tags_locked(conn: &rusqlite::Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt =
        conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE")?;
    let tags = stmt
        .query_map([], tag_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

fn get_tag_by_name(conn: &rusqlite::Connection, name: &str) -> Result<Tag, AppError> {
    conn.query_row(
        "SELECT id, name, color, created_at FROM tags WHERE name = ?1",
        [name],
        tag_from_row,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("tag '{}' not found", name)))
}

fn tag_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
    })
}

pub fn row_to_productized_item(row: &rusqlite::Row<'_>) -> ClipboardItem {
    let content_type_str: String = row.get(1).unwrap_or_default();
    ClipboardItem {
        id: row.get(0).unwrap_or(0),
        content_type: parse_content_type(&content_type_str),
        content: row.get(2).unwrap_or_default(),
        preview: row.get(3).unwrap_or(None),
        hash: row.get(4).unwrap_or_default(),
        size: row.get(5).unwrap_or(0),
        metadata: row.get(6).unwrap_or(None),
        is_favorited: row.get::<_, i64>(7).unwrap_or(0) != 0,
        created_at: row.get(8).unwrap_or(0),
        last_used_at: row.get(9).unwrap_or(0),
        is_sensitive: row.get::<_, i64>(10).unwrap_or(0) != 0,
        sensitivity_reason: row.get(11).unwrap_or(None),
        tags: Vec::new(),
    }
}

fn parse_content_type(value: &str) -> ContentType {
    match value {
        "image" => ContentType::Image,
        "file" => ContentType::File,
        _ => ContentType::Text,
    }
}

fn has_long_token(content: &str) -> bool {
    content
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-' && c != '.')
        .any(|part| part.len() >= 32 && part.chars().filter(|c| c.is_ascii_digit()).count() >= 4)
}

fn escape_sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
