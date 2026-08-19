use base64::Engine;
use sha2::{Digest, Sha256};
use std::io::Cursor;

use crate::config::registry;
use crate::database::clipboard_query::{self, ClipboardQuerySpec};
use crate::database::types::{ContentType, StatsResponse};
use crate::{AppError, Database};

use super::types::ClipboardItem;

pub const MAX_CUSTOM_TITLE_CHARS: usize = 200;
pub const MAX_NOTE_CHARS: usize = 10_000;
const MAX_IMAGE_REPRESENTATION_BYTES: usize = 128 * 1024 * 1024;

struct PreparedImageAssets {
    source_format: &'static str,
    source_mime: &'static str,
    source_hash: String,
    canonical_hash: String,
    canonical_bytes: Option<Vec<u8>>,
    thumbnail_hash: String,
    thumbnail_bytes: Vec<u8>,
    width: i64,
    height: i64,
    thumbnail_width: i64,
    thumbnail_height: i64,
}

impl PreparedImageAssets {
    fn canonical_bytes<'a>(&'a self, source: &'a [u8]) -> &'a [u8] {
        self.canonical_bytes.as_deref().unwrap_or(source)
    }
}

pub fn get_stats(db: &Database) -> Result<StatsResponse, AppError> {
    let conn = db.get_connection()?;
    let total_items =
        conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row.get(0))?;
    let text_count = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE content_type = 'text'",
        [],
        |row| row.get(0),
    )?;
    let image_count = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE content_type = 'image'",
        [],
        |row| row.get(0),
    )?;
    let file_count = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE content_type = 'file'",
        [],
        |row| row.get(0),
    )?;
    let favorite_count = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_favorited = 1",
        [],
        |row| row.get(0),
    )?;
    let sensitive_count = conn.query_row(
        "SELECT COUNT(*) FROM clipboard_items WHERE is_sensitive = 1",
        [],
        |row| row.get(0),
    )?;
    let tag_count = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    let snippet_count = conn.query_row("SELECT COUNT(*) FROM snippets", [], |row| row.get(0))?;
    let source_rule_count =
        conn.query_row("SELECT COUNT(*) FROM clipboard_source_rules", [], |row| {
            row.get(0)
        })?;
    let total_size_bytes = conn.query_row(
        "SELECT COALESCE(SUM(size), 0) FROM clipboard_items",
        [],
        |row| row.get(0),
    )?;

    Ok(StatsResponse {
        total_items,
        text_count,
        image_count,
        file_count,
        favorite_count,
        sensitive_count,
        tag_count,
        snippet_count,
        source_rule_count,
        total_size_bytes,
        db_size_bytes: 0,
    })
}

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
            formats: Vec::new(),
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
            formats: Vec::new(),
        };

        let result = insert(&db, &item);

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
        assert!(get_list(&db, 100, 0).unwrap().is_empty());
    }

    #[test]
    fn source_attribution_updates_only_when_the_new_insert_has_source() {
        let db = test_db();
        let content = "same clipboard content";
        let item = crate::database::types::NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.into()),
            hash: format!("{:x}", sha2::Sha256::digest(content.as_bytes())),
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
        };

        let first =
            insert_with_source(&db, &item, Some("first.exe"), Some("First document")).unwrap();
        assert_eq!(first.source_application.as_deref(), Some("first.exe"));
        assert_eq!(first.source_window_title.as_deref(), Some("First document"));

        let without_source = insert(&db, &item).unwrap();
        assert_eq!(without_source.source_application, first.source_application);
        assert_eq!(
            without_source.source_window_title,
            first.source_window_title
        );

        let changed = insert_with_source(&db, &item, Some("second.exe"), None).unwrap();
        assert_eq!(changed.source_application.as_deref(), Some("second.exe"));
        assert_eq!(changed.source_window_title, None);
    }

    #[test]
    fn update_annotations_trims_values_and_normalizes_empty_strings() {
        let db = test_db();
        let item = insert_text(&db, "annotated content");

        let updated = update_annotations(
            &db,
            item.id,
            Some("  Project brief  ".into()),
            Some("  Keep the complete source.\n  ".into()),
        )
        .unwrap();

        assert_eq!(updated.custom_title.as_deref(), Some("Project brief"));
        assert_eq!(updated.note.as_deref(), Some("Keep the complete source."));

        let cleared =
            update_annotations(&db, item.id, Some(" \t ".into()), Some("\n  ".into())).unwrap();
        assert_eq!(cleared.custom_title, None);
        assert_eq!(cleared.note, None);
    }

    #[test]
    fn update_annotations_validates_unicode_character_limits_and_missing_items() {
        let db = test_db();
        let item = insert_text(&db, "annotation limits");

        let accepted = update_annotations(
            &db,
            item.id,
            Some("题".repeat(MAX_CUSTOM_TITLE_CHARS)),
            Some("注".repeat(MAX_NOTE_CHARS)),
        )
        .unwrap();
        assert_eq!(
            accepted.custom_title.as_deref().unwrap().chars().count(),
            MAX_CUSTOM_TITLE_CHARS
        );

        let long_title = update_annotations(
            &db,
            item.id,
            Some("题".repeat(MAX_CUSTOM_TITLE_CHARS + 1)),
            None,
        );
        assert!(
            matches!(long_title, Err(AppError::InvalidInput(message)) if message.contains("title"))
        );

        let long_note =
            update_annotations(&db, item.id, None, Some("注".repeat(MAX_NOTE_CHARS + 1)));
        assert!(
            matches!(long_note, Err(AppError::InvalidInput(message)) if message.contains("note"))
        );

        let missing = update_annotations(&db, 999_999, None, None);
        assert!(matches!(missing, Err(AppError::NotFound(message)) if message.contains("999999")));
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
    insert_with_source(db, item, None, None)
}

pub(crate) fn insert_with_source(
    db: &Database,
    item: &crate::database::types::NewClipboardItem,
    source_application: Option<&str>,
    source_window_title: Option<&str>,
) -> Result<ClipboardItem, AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let sensitive_capture_policy =
        crate::database::config::get(db, registry::KEY_SENSITIVE_CAPTURE_POLICY)?
            .unwrap_or_else(|| "flag".to_string());

    let image_assets = if item.content_type == ContentType::Image {
        Some(prepare_image_assets(&item.data)?)
    } else {
        None
    };
    let content_str = match item.content_type {
        ContentType::Text => String::from_utf8_lossy(&item.data).to_string(),
        ContentType::Image => format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(
                image_assets
                    .as_ref()
                    .expect("image assets")
                    .canonical_bytes(&item.data)
            )
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

    let image_budget = if image_assets.is_some() {
        crate::database::config::get(db, registry::KEY_IMAGE_BUDGET_BYTES)?
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(2 * 1024 * 1024 * 1024)
    } else {
        0
    };

    let mut conn = db.get_connection()?;
    let transaction = conn.transaction()?;

    if let Some(assets) = image_assets.as_ref() {
        let used: i64 = transaction.query_row(
            "SELECT COALESCE(SUM(byte_length), 0) FROM binary_blobs",
            [],
            |row| row.get(0),
        )?;
        let canonical_bytes = assets.canonical_bytes(&item.data);
        let candidates = [
            (assets.source_hash.as_str(), item.data.len()),
            (assets.canonical_hash.as_str(), canonical_bytes.len()),
            (assets.thumbnail_hash.as_str(), assets.thumbnail_bytes.len()),
        ];
        let mut unique_hashes = std::collections::HashSet::new();
        let mut required = 0i64;
        for (hash, byte_length) in candidates {
            if unique_hashes.insert(hash)
                && transaction.query_row(
                    "SELECT NOT EXISTS(SELECT 1 FROM binary_blobs WHERE sha256 = ?1)",
                    [hash],
                    |row| row.get::<_, bool>(0),
                )?
            {
                required = required.saturating_add(byte_length as i64);
            }
        }
        if image_budget >= 0 && used.saturating_add(required) > image_budget {
            return Err(AppError::Database(
                "image storage budget reached; clean up old items or increase the budget".into(),
            ));
        }
        transaction.execute(
            "INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![assets.source_hash, item.data.len() as i64, item.data, now],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                assets.canonical_hash,
                canonical_bytes.len() as i64,
                canonical_bytes,
                now
            ],
        )?;
        transaction.execute(
            "INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                assets.thumbnail_hash,
                assets.thumbnail_bytes.len() as i64,
                assets.thumbnail_bytes,
                now
            ],
        )?;
    }

    transaction.execute(
        "INSERT INTO clipboard_items
         (content_type, content, preview, hash, size, metadata, source_application,
          source_window_title, is_sensitive, sensitivity_reason, created_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(hash) DO UPDATE SET
            last_used_at = excluded.last_used_at,
            is_sensitive = excluded.is_sensitive,
            sensitivity_reason = excluded.sensitivity_reason,
            source_application = CASE
                WHEN excluded.source_application IS NOT NULL OR excluded.source_window_title IS NOT NULL
                THEN excluded.source_application
                ELSE clipboard_items.source_application
            END,
            source_window_title = CASE
                WHEN excluded.source_application IS NOT NULL OR excluded.source_window_title IS NOT NULL
                THEN excluded.source_window_title
                ELSE clipboard_items.source_window_title
            END",
        rusqlite::params![
            item.content_type.as_str(),
            content_str,
            item.preview,
            item.hash,
            item.size,
            item.metadata,
            source_application,
            source_window_title,
            sensitivity.is_some() as i64,
            sensitivity.as_deref(),
            now,
            now,
        ],
    )?;

    let saved_id: i64 = transaction.query_row(
        "SELECT id FROM clipboard_items WHERE hash = ?1",
        [&item.hash],
        |row| row.get(0),
    )?;
    crate::database::formats::replace_for_item(
        &transaction,
        saved_id,
        item.content_type,
        &content_str,
        &item.formats,
    )?;
    crate::database::ocr::ensure_for_image(&transaction, saved_id, item.content_type, now)?;
    if let Some(assets) = image_assets.as_ref() {
        let canonical_bytes = assets.canonical_bytes(&item.data);
        transaction.execute(
            "INSERT OR REPLACE INTO clipboard_item_representations
             (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
             VALUES (?1, ?2, 'source', ?3, ?4, ?5, ?6, ?7, 10, ?8)",
            rusqlite::params![saved_id, assets.source_hash, assets.source_format, assets.source_mime, assets.width, assets.height, item.data.len() as i64, item.metadata],
        )?;
        transaction.execute(
            "INSERT OR REPLACE INTO clipboard_item_representations
             (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
             VALUES (?1, ?2, 'canonical', 'png', 'image/png', ?3, ?4, ?5, 0, ?6)",
            rusqlite::params![saved_id, assets.canonical_hash, assets.width, assets.height, canonical_bytes.len() as i64, item.metadata],
        )?;
        transaction.execute(
            "INSERT OR REPLACE INTO clipboard_item_representations
             (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
             VALUES (?1, ?2, 'thumbnail', 'png', 'image/png', ?3, ?4, ?5, 0, '{\"generated\":true}')",
            rusqlite::params![saved_id, assets.thumbnail_hash, assets.thumbnail_width, assets.thumbnail_height, assets.thumbnail_bytes.len() as i64],
        )?;
    }
    transaction.commit()?;

    let saved = clipboard_query::fetch_item_by_hash_locked(&conn, &item.hash)?;
    drop(conn);
    if let Err(error) = crate::search::index_clipboard_item(db, &saved) {
        tracing::warn!(
            "Failed to synchronize clipboard item {} to full-text search: {}",
            saved.id,
            error
        );
    }
    Ok(saved)
}

fn prepare_image_assets(data: &[u8]) -> Result<PreparedImageAssets, AppError> {
    if data.len() > MAX_IMAGE_REPRESENTATION_BYTES {
        return Err(AppError::InvalidInput(
            "image representation exceeds the 128 MiB safety limit".into(),
        ));
    }
    let image_format = image::guess_format(data)
        .map_err(|error| AppError::Clipboard(format!("image format detection failed: {error}")))?;
    let (source_format, source_mime) = match image_format {
        image::ImageFormat::Png => ("png", "image/png"),
        image::ImageFormat::Jpeg => ("jpeg", "image/jpeg"),
        image::ImageFormat::WebP => ("webp", "image/webp"),
        image::ImageFormat::Gif => ("gif", "image/gif"),
        _ => {
            return Err(AppError::Clipboard(format!(
                "unsupported image representation format: {image_format:?}"
            )))
        }
    };
    let decoded = image::load_from_memory_with_format(data, image_format)
        .map_err(|error| AppError::Clipboard(format!("image decode failed: {error}")))?;
    let (width, height) = (decoded.width() as i64, decoded.height() as i64);
    let canonical_bytes = if image_format == image::ImageFormat::Png {
        None
    } else {
        let mut png = Vec::new();
        decoded
            .write_to(&mut Cursor::new(&mut png), image::ImageFormat::Png)
            .map_err(|error| {
                AppError::Clipboard(format!("canonical PNG generation failed: {error}"))
            })?;
        Some(png)
    };
    let canonical_hash = format!(
        "{:x}",
        Sha256::digest(canonical_bytes.as_deref().unwrap_or(data))
    );
    let thumbnail = decoded.thumbnail(192, 192);
    let (thumbnail_width, thumbnail_height) = (thumbnail.width() as i64, thumbnail.height() as i64);
    let mut thumbnail_bytes = Vec::new();
    thumbnail
        .write_to(
            &mut Cursor::new(&mut thumbnail_bytes),
            image::ImageFormat::Png,
        )
        .map_err(|error| AppError::Clipboard(format!("thumbnail generation failed: {error}")))?;

    Ok(PreparedImageAssets {
        source_format,
        source_mime,
        source_hash: format!("{:x}", Sha256::digest(data)),
        canonical_hash,
        canonical_bytes,
        thumbnail_hash: format!("{:x}", Sha256::digest(&thumbnail_bytes)),
        thumbnail_bytes,
        width,
        height,
        thumbnail_width,
        thumbnail_height,
    })
}

pub fn update_annotations(
    db: &Database,
    id: i64,
    custom_title: Option<String>,
    note: Option<String>,
) -> Result<ClipboardItem, AppError> {
    let custom_title = normalize_annotation(custom_title, MAX_CUSTOM_TITLE_CHARS, "custom title")?;
    let note = normalize_annotation(note, MAX_NOTE_CHARS, "note")?;

    let conn = db.get_connection()?;
    let changed = conn.execute(
        "UPDATE clipboard_items SET custom_title = ?1, note = ?2 WHERE id = ?3",
        rusqlite::params![custom_title, note, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("clipboard item {id} not found")));
    }

    let mut updated = clipboard_query::fetch_item_by_id_required_locked(&conn, id)?;
    clipboard_query::hydrate_tags(&conn, std::slice::from_mut(&mut updated))?;
    drop(conn);
    if let Err(error) = crate::search::index_clipboard_item(db, &updated) {
        tracing::warn!(
            "Failed to synchronize clipboard item {} annotations to full-text search: {}",
            updated.id,
            error
        );
    }
    Ok(updated)
}

fn normalize_annotation(
    value: Option<String>,
    max_chars: usize,
    field_name: &str,
) -> Result<Option<String>, AppError> {
    let normalized = value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    });
    if normalized
        .as_deref()
        .is_some_and(|value| value.chars().count() > max_chars)
    {
        return Err(AppError::InvalidInput(format!(
            "clipboard {field_name} must be at most {max_chars} characters"
        )));
    }
    Ok(normalized)
}

pub fn delete(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    let deleted = conn.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
    crate::database::productization::cleanup_unreferenced_blobs_locked(&conn)?;
    drop(conn);
    if deleted > 0 {
        if let Err(error) = crate::search::delete_items(db, &[id]) {
            tracing::warn!("Failed to delete item {id} from full-text search: {error}");
        }
    }
    Ok(())
}

pub fn clear(db: &Database) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_items", [])?;
    crate::database::productization::cleanup_unreferenced_blobs_locked(&conn)?;
    drop(conn);
    if let Err(error) = crate::search::clear(db) {
        tracing::warn!("Failed to clear full-text search index: {error}");
    }
    Ok(())
}

pub fn cleanup_old_records(db: &Database, max_count: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    let deleted_ids = {
        let mut statement = conn.prepare(
            "SELECT id FROM clipboard_items
             WHERE is_favorited = 0
               AND id NOT IN (
                   SELECT id FROM clipboard_items
                   WHERE is_favorited = 0
                   ORDER BY created_at DESC
                   LIMIT ?1
               )",
        )?;
        let ids = statement
            .query_map([max_count], |row| row.get::<_, i64>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        ids
    };
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
    crate::database::productization::cleanup_unreferenced_blobs_locked(&conn)?;
    drop(conn);
    if let Err(error) = crate::search::delete_items(db, &deleted_ids) {
        tracing::warn!("Failed to remove expired items from full-text search: {error}");
    }
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
