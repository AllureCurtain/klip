use base64::Engine;

use crate::config::registry;
use crate::database::clipboard_query::{self, ClipboardQuerySpec};
use crate::database::types::ContentType;
use crate::{AppError, Database};

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

        crate::database::clipboard_query::fetch_item_by_hash_locked(&conn, &hash).unwrap()
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

    #[test]
    fn insert_skips_sensitive_text_when_policy_is_skip() {
        let db = test_db();
        crate::database::config::set(&db, registry::KEY_SENSITIVE_CAPTURE_POLICY, "skip").unwrap();
        let hash = format!("{:x}", sha2::Sha256::digest(b"password=super-secret"));
        let item = crate::database::types::NewClipboardItem {
            content_type: ContentType::Text,
            data: b"password=super-secret".to_vec(),
            preview: Some("password=super-secret".to_string()),
            hash,
            size: 21,
            metadata: None,
        };

        let result = insert(&db, &item);

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        assert!(get_list(&db, 100, 0).unwrap().is_empty());
    }
}

pub fn get_list(db: &Database, limit: i64, offset: i64) -> Result<Vec<ClipboardItem>, AppError> {
    let spec = ClipboardQuerySpec::new(limit, offset);
    clipboard_query::fetch_items(db, &spec)
}

pub fn search(
    db: &Database,
    query: &str,
    content_type: Option<&str>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, AppError> {
    let start = std::time::Instant::now();

    let mut spec = ClipboardQuerySpec::new(limit, 0);
    spec.text_query = Some(query.to_string());
    spec.content_type = content_type.map(|value| value.to_string());
    let items = clipboard_query::fetch_items(db, &spec)?;

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

pub fn get_by_id(db: &Database, id: i64) -> Result<Option<ClipboardItem>, AppError> {
    clipboard_query::fetch_item_by_id(db, id)
}

pub fn insert(
    db: &Database,
    item: &crate::database::types::NewClipboardItem,
) -> Result<ClipboardItem, AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let sensitive_capture_policy =
        crate::database::config::get(db, registry::KEY_SENSITIVE_CAPTURE_POLICY)?
            .unwrap_or_else(|| "flag".to_string());

    let content_str = match item.content_type {
        ContentType::Text => String::from_utf8_lossy(&item.data).to_string(),
        ContentType::Image => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&item.data)
        ),
        ContentType::File => String::from_utf8_lossy(&item.data).to_string(),
    };
    let sensitivity =
        crate::database::productization::detect_sensitive(item.content_type.as_str(), &content_str);

    if sensitivity.is_some() && sensitive_capture_policy == "skip" {
        return Err(AppError::InvalidInput(
            "sensitive clipboard content skipped by policy".into(),
        ));
    }

    let conn = db.get_connection()?;

    conn.execute(
        "INSERT INTO clipboard_items
         (content_type, content, preview, hash, size, metadata, is_sensitive,
          sensitivity_reason, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(hash) DO UPDATE SET
            last_used_at = excluded.last_used_at,
            is_sensitive = excluded.is_sensitive,
            sensitivity_reason = excluded.sensitivity_reason",
        rusqlite::params![
            item.content_type.as_str(),
            content_str,
            item.preview,
            item.hash,
            item.size,
            item.metadata,
            sensitivity.is_some() as i64,
            sensitivity.as_deref(),
            now,
            now,
        ],
    )?;

    clipboard_query::fetch_item_by_hash_locked(&conn, &item.hash)
}

pub fn delete(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
    Ok(())
}

pub fn clear(db: &Database) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_items", [])?;
    Ok(())
}

pub fn cleanup_old_records(db: &Database, max_count: i64) -> Result<(), AppError> {
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
    )?;
    Ok(())
}

pub fn touch_last_used(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    conn.execute(
        "UPDATE clipboard_items SET last_used_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )?;
    Ok(())
}

pub fn toggle_favorite(db: &Database, id: i64) -> Result<ClipboardItem, AppError> {
    let conn = db.get_connection()?;
    conn.execute(
        "UPDATE clipboard_items SET is_favorited = CASE WHEN is_favorited = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        [id],
    )?;

    clipboard_query::fetch_item_by_id_required_locked(&conn, id)
}
