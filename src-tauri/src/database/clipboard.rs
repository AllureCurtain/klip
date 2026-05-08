use rusqlite::OptionalExtension;

use base64::Engine;

use crate::database::types::ContentType;
use crate::Database;

use super::types::ClipboardItem;

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use sha2::Digest;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_text(db: &Database, content: &str) -> ClipboardItem {
        let hash = format!("{:x}", sha2::Sha256::digest(content.as_bytes()));
        let item = crate::database::types::NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.chars().take(100).collect()),
            hash,
            size: content.len() as i64,
            metadata: None,
        };
        insert(db, &item).unwrap()
    }

    fn insert_text_at_time(db: &Database, content: &str, created_at: i64) -> ClipboardItem {
        let hash = format!("{:x}", sha2::Sha256::digest(content.as_bytes()));
        let conn = db.get_connection().unwrap();
        conn.execute(
            "INSERT INTO clipboard_items (content_type, content, preview, hash, size, created_at, last_used_at)
             VALUES ('text', ?1, ?2, ?3, ?4, ?5, ?5)
             ON CONFLICT(hash) DO UPDATE SET last_used_at = excluded.last_used_at",
            rusqlite::params![content, content, hash, content.len() as i64, created_at],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items WHERE hash = ?1",
        ).unwrap();
        stmt.query_row([&hash], |row| Ok(row_to_clipboard_item(row)))
            .unwrap()
    }

    #[test]
    fn toggle_favorite_flips_flag() {
        let db = test_db();
        let item = insert_text(&db, "hello");

        assert!(!item.is_favorited);

        let updated = toggle_favorite(&db, item.id).unwrap();
        assert!(updated.is_favorited);

        let toggled_back = toggle_favorite(&db, item.id).unwrap();
        assert!(!toggled_back.is_favorited);
    }

    #[test]
    fn cleanup_preserves_favorited_items() {
        let db = test_db();
        let base_ts = 1000i64;

        // Insert 5 items with strictly increasing timestamps
        let items: Vec<_> = (0..5)
            .map(|i| insert_text_at_time(&db, &format!("item-{}", i), base_ts + i as i64 * 100))
            .collect();
        toggle_favorite(&db, items[2].id).unwrap();

        // Cleanup keeping only 2 non-favorited newest —
        // the favorited item should survive regardless of its age
        cleanup_old_records(&db, 2).unwrap();

        let remaining = get_list(&db, 100, 0).unwrap();
        let remaining_ids: Vec<i64> = remaining.iter().map(|i| i.id).collect();

        assert!(
            remaining_ids.contains(&items[2].id),
            "favorited item should survive cleanup"
        );
        assert!(
            remaining_ids.contains(&items[4].id),
            "newest non-fav should survive"
        );
        assert!(
            remaining_ids.contains(&items[3].id),
            "2nd newest non-fav should survive"
        );
        assert!(
            !remaining_ids.contains(&items[0].id),
            "oldest should be deleted"
        );
        assert!(
            !remaining_ids.contains(&items[1].id),
            "2nd oldest should be deleted"
        );
    }

    #[test]
    fn search_with_content_type_filter() {
        let db = test_db();

        insert_text(&db, "hello text");

        // Insert an image item directly via SQL
        {
            let conn = db.get_connection().unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;
            conn.execute(
                "INSERT INTO clipboard_items (content_type, content, preview, hash, size, created_at, last_used_at)
                 VALUES ('image', 'data:image/png;base64,abc', '图片 1x1', 'img-hash-1', 100, ?1, ?1)",
                [now],
            ).unwrap();
        }

        // Search without filter — should return both
        let all = search(&db, "", None, 100).unwrap();
        assert_eq!(all.len(), 2);

        // Filter for text only
        let text_only = search(&db, "", Some("text"), 100).unwrap();
        assert_eq!(text_only.len(), 1);
        assert_eq!(text_only[0].content_type, ContentType::Text);

        // Filter for image only
        let image_only = search(&db, "", Some("image"), 100).unwrap();
        assert_eq!(image_only.len(), 1);
        assert_eq!(image_only[0].content_type, ContentType::Image);

        // Filter for file — should return nothing
        let file_only = search(&db, "", Some("file"), 100).unwrap();
        assert!(file_only.is_empty());
    }

    #[test]
    fn search_with_query_and_content_type() {
        let db = test_db();

        insert_text(&db, "hello world");
        insert_text(&db, "hello rust");

        // Insert image
        {
            let conn = db.get_connection().unwrap();
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;
            conn.execute(
                "INSERT INTO clipboard_items (content_type, content, preview, hash, size, created_at, last_used_at)
                 VALUES ('image', 'data:image/png;base64,abc', 'hello image', 'img-hash-2', 100, ?1, ?1)",
                [now],
            ).unwrap();
        }

        // Search "hello" with text filter — 2 text items match
        let results = search(&db, "hello", Some("text"), 100).unwrap();
        assert_eq!(results.len(), 2);

        // Search "hello" with image filter — 1 image with "hello" in preview matches
        let img_results = search(&db, "hello", Some("image"), 100).unwrap();
        assert_eq!(img_results.len(), 1);
    }

    #[test]
    fn get_list_orders_by_last_used_then_created_at() {
        let db = test_db();
        let older = insert_text_at_time(&db, "older", 1_000);
        let newer = insert_text_at_time(&db, "newer", 2_000);

        let baseline = get_list(&db, 10, 0).unwrap();
        assert_eq!(baseline[0].id, newer.id);
        assert_eq!(baseline[1].id, older.id);

        touch_last_used(&db, older.id).unwrap();

        let reordered = get_list(&db, 10, 0).unwrap();
        assert_eq!(reordered[0].id, older.id);
        assert_eq!(reordered[1].id, newer.id);
    }
}

pub fn get_list(db: &Database, limit: i64, offset: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = db.get_connection()?;

    // Sort by last_used_at first so re-pasted items float back to the top,
    // then by created_at as a tie-breaker for never-pasted entries.
    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             ORDER BY last_used_at DESC, created_at DESC
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

pub fn search(
    db: &Database,
    query: &str,
    content_type: Option<&str>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, String> {
    let start = std::time::Instant::now();

    let conn = db.get_connection()?;

    let sql = match content_type {
        Some(_) =>
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE (preview LIKE ?1 OR (content_type != 'image' AND content LIKE ?1))
               AND content_type = ?3
             ORDER BY last_used_at DESC, created_at DESC
             LIMIT ?2",
        None =>
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items
             WHERE preview LIKE ?1
                OR (content_type != 'image' AND content LIKE ?1)
             ORDER BY last_used_at DESC, created_at DESC
             LIMIT ?2",
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;

    let search_pattern = format!("%{}%", query);
    let limit_str = limit.to_string();

    let items = match content_type {
        Some(ct) => stmt
            .query_map(rusqlite::params![&search_pattern, &limit_str, ct], |row| {
                Ok(row_to_clipboard_item(row))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
        None => stmt
            .query_map([&search_pattern, &limit_str], |row| {
                Ok(row_to_clipboard_item(row))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?,
    };

    let elapsed = start.elapsed();
    if elapsed.as_millis() > 50 {
        tracing::warn!(
            "Slow search (query='{}', type={:?}): {}ms",
            query,
            content_type,
            elapsed.as_millis()
        );
    }

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
        "DELETE FROM clipboard_items
         WHERE is_favorited = 0
           AND id NOT IN (
               SELECT id FROM clipboard_items
               WHERE is_favorited = 0
               ORDER BY created_at DESC
               LIMIT ?1
           )",
        [max_count],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Mark an item as just-used by bumping `last_used_at` to now.
/// Called after a successful paste so the item floats to the top of the
/// list view on the next render.
pub fn touch_last_used(db: &Database, id: i64) -> Result<(), String> {
    let conn = db.get_connection()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    conn.execute(
        "UPDATE clipboard_items SET last_used_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggle the `is_favorited` flag on a clipboard item and return the updated item.
pub fn toggle_favorite(db: &Database, id: i64) -> Result<ClipboardItem, String> {
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE clipboard_items SET is_favorited = CASE WHEN is_favorited = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        [id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at
             FROM clipboard_items WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    stmt.query_row([id], |row| Ok(row_to_clipboard_item(row)))
        .map_err(|e| e.to_string())
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
