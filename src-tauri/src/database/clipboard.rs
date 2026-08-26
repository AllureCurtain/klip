use rusqlite::OptionalExtension;
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

struct PreparedImageSource {
    format_name: String,
    mime_type: Option<String>,
    clipboard_format: Option<String>,
    hash: String,
    data: Vec<u8>,
    metadata: Option<String>,
}

struct PreparedImageAssets {
    sources: Vec<PreparedImageSource>,
    canonical_hash: String,
    canonical_bytes: Vec<u8>,
    thumbnail_hash: String,
    thumbnail_bytes: Vec<u8>,
    width: i64,
    height: i64,
    thumbnail_width: i64,
    thumbnail_height: i64,
}

pub(crate) struct InsertOutcome {
    pub item: ClipboardItem,
    pub evicted_image_ids: Vec<i64>,
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
            image_sources: Vec::new(),
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
            image_sources: Vec::new(),
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
            image_sources: Vec::new(),
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
    Ok(insert_with_source_outcome(db, item, source_application, source_window_title)?.item)
}

pub(crate) fn insert_with_source_outcome(
    db: &Database,
    item: &crate::database::types::NewClipboardItem,
    source_application: Option<&str>,
    source_window_title: Option<&str>,
) -> Result<InsertOutcome, AppError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;
    let sensitive_capture_policy =
        crate::database::config::get(db, registry::KEY_SENSITIVE_CAPTURE_POLICY)?
            .unwrap_or_else(|| "flag".to_string());

    let image_assets = if item.content_type == ContentType::Image {
        Some(prepare_image_assets(&item.data, &item.image_sources)?)
    } else {
        None
    };
    let content_str = match item.content_type {
        ContentType::Text => String::from_utf8_lossy(&item.data).to_string(),
        ContentType::Image => String::new(),
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
    let mut evicted_image_ids = Vec::new();

    if let Some(assets) = image_assets.as_ref() {
        let existing_item_id = transaction
            .query_row(
                "SELECT id FROM clipboard_items WHERE hash = ?1",
                [&item.hash],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        evicted_image_ids =
            enforce_image_budget(&transaction, image_budget, assets, existing_item_id)?;
        for source in &assets.sources {
            insert_blob(&transaction, &source.hash, &source.data, now)?;
        }
        insert_blob(
            &transaction,
            &assets.canonical_hash,
            &assets.canonical_bytes,
            now,
        )?;
        insert_blob(
            &transaction,
            &assets.thumbnail_hash,
            &assets.thumbnail_bytes,
            now,
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
        for (priority, source) in assets.sources.iter().enumerate() {
            let metadata = representation_metadata(source);
            transaction.execute(
                "INSERT OR REPLACE INTO clipboard_item_representations
                 (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
                 VALUES (?1, ?2, 'source', ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    saved_id,
                    source.hash,
                    source.format_name,
                    source.mime_type,
                    assets.width,
                    assets.height,
                    source.data.len() as i64,
                    100 - priority as i64,
                    metadata,
                ],
            )?;
        }
        transaction.execute(
            "INSERT OR REPLACE INTO clipboard_item_representations
             (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
             VALUES (?1, ?2, 'canonical', 'png', 'image/png', ?3, ?4, ?5, 0, ?6)",
            rusqlite::params![saved_id, assets.canonical_hash, assets.width, assets.height, assets.canonical_bytes.len() as i64, item.metadata],
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
    if !evicted_image_ids.is_empty() {
        if let Err(error) = crate::search::delete_items(db, &evicted_image_ids) {
            tracing::warn!("Failed to remove capacity-evicted images from search: {error}");
        }
    }
    Ok(InsertOutcome {
        item: saved,
        evicted_image_ids,
    })
}

fn prepare_image_assets(
    canonical_png: &[u8],
    supplied_sources: &[crate::database::types::NewImageRepresentation],
) -> Result<PreparedImageAssets, AppError> {
    if canonical_png.len() > MAX_IMAGE_REPRESENTATION_BYTES {
        return Err(AppError::InvalidInput(
            "image representation exceeds the 128 MiB safety limit".into(),
        ));
    }
    let image_format = image::guess_format(canonical_png)
        .map_err(|error| AppError::Clipboard(format!("image format detection failed: {error}")))?;
    if image_format != image::ImageFormat::Png {
        return Err(AppError::Clipboard(
            "canonical image representation must be PNG".into(),
        ));
    }
    let decoded = image::load_from_memory_with_format(canonical_png, image_format)
        .map_err(|error| AppError::Clipboard(format!("image decode failed: {error}")))?;
    let (width, height) = (decoded.width() as i64, decoded.height() as i64);
    let canonical_rgba = decoded.to_rgba8();
    let input_sources = if supplied_sources.is_empty() {
        vec![crate::database::types::NewImageRepresentation {
            format_name: "png".into(),
            mime_type: Some("image/png".into()),
            clipboard_format: Some("PNG".into()),
            data: canonical_png.to_vec(),
            metadata: None,
        }]
    } else {
        supplied_sources.to_vec()
    };
    let mut sources = Vec::new();
    let mut seen_formats = std::collections::HashSet::new();
    for source in input_sources {
        if source.data.len() > MAX_IMAGE_REPRESENTATION_BYTES {
            return Err(AppError::InvalidInput(format!(
                "{} image representation exceeds the 128 MiB safety limit",
                source.format_name
            )));
        }
        let format_name = normalize_source_format(&source.format_name)?;
        if !seen_formats.insert(format_name.to_string()) {
            continue;
        }
        validate_source_representation(
            format_name,
            &source.data,
            &canonical_rgba,
            width as u32,
            height as u32,
        )?;
        sources.push(PreparedImageSource {
            format_name: format_name.into(),
            mime_type: source.mime_type,
            clipboard_format: source.clipboard_format,
            hash: format!("{:x}", Sha256::digest(&source.data)),
            data: source.data,
            metadata: source.metadata,
        });
    }
    let canonical_hash = format!("{:x}", Sha256::digest(canonical_png));
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
        sources,
        canonical_hash,
        canonical_bytes: canonical_png.to_vec(),
        thumbnail_hash: format!("{:x}", Sha256::digest(&thumbnail_bytes)),
        thumbnail_bytes,
        width,
        height,
        thumbnail_width,
        thumbnail_height,
    })
}

fn normalize_source_format(value: &str) -> Result<&'static str, AppError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "png" => Ok("png"),
        "jpg" | "jpeg" | "jfif" => Ok("jpeg"),
        "webp" => Ok("webp"),
        "gif" => Ok("gif"),
        "dib" | "cf_dib" => Ok("dib"),
        "dibv5" | "cf_dibv5" => Ok("dibv5"),
        other => Err(AppError::Clipboard(format!(
            "unsupported image source representation: {other}"
        ))),
    }
}

fn validate_source_representation(
    format_name: &str,
    data: &[u8],
    canonical_rgba: &image::RgbaImage,
    width: u32,
    height: u32,
) -> Result<(), AppError> {
    if matches!(format_name, "dib" | "dibv5") {
        let minimum = if format_name == "dibv5" { 124 } else { 40 };
        if data.len() < minimum {
            return Err(AppError::Clipboard(format!(
                "{format_name} source representation is truncated"
            )));
        }
        let dib_width = i32::from_le_bytes(data[4..8].try_into().unwrap()).unsigned_abs();
        let dib_height = i32::from_le_bytes(data[8..12].try_into().unwrap()).unsigned_abs();
        if dib_width != width || dib_height != height {
            return Err(AppError::Clipboard(format!(
                "{format_name} dimensions {dib_width}x{dib_height} do not match canonical {width}x{height}"
            )));
        }
        return Ok(());
    }

    let expected = match format_name {
        "png" => image::ImageFormat::Png,
        "jpeg" => image::ImageFormat::Jpeg,
        "webp" => image::ImageFormat::WebP,
        "gif" => image::ImageFormat::Gif,
        _ => unreachable!(),
    };
    if image::guess_format(data).ok() != Some(expected) {
        return Err(AppError::Clipboard(format!(
            "{format_name} source representation failed magic-byte validation"
        )));
    }
    let decoded = image::load_from_memory_with_format(data, expected)
        .map_err(|error| AppError::Clipboard(format!("{format_name} decode failed: {error}")))?
        .to_rgba8();
    if decoded.dimensions() != (width, height) || decoded.as_raw() != canonical_rgba.as_raw() {
        return Err(AppError::Clipboard(format!(
            "{format_name} source pixels do not match canonical PNG"
        )));
    }
    Ok(())
}

fn representation_metadata(source: &PreparedImageSource) -> Option<String> {
    let mut value = source
        .metadata
        .as_deref()
        .and_then(|metadata| serde_json::from_str::<serde_json::Value>(metadata).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if let (Some(object), Some(clipboard_format)) =
        (value.as_object_mut(), source.clipboard_format.as_deref())
    {
        object.insert(
            "clipboardFormat".into(),
            serde_json::Value::String(clipboard_format.into()),
        );
    }
    (!value.as_object().is_some_and(|object| object.is_empty())).then(|| value.to_string())
}

fn insert_blob(
    conn: &rusqlite::Connection,
    hash: &str,
    data: &[u8],
    now: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![hash, data.len() as i64, data, now],
    )?;
    Ok(())
}

fn enforce_image_budget(
    conn: &rusqlite::Connection,
    budget: i64,
    assets: &PreparedImageAssets,
    protected_item_id: Option<i64>,
) -> Result<Vec<i64>, AppError> {
    if budget < 0 {
        return Ok(Vec::new());
    }
    let incoming = assets
        .sources
        .iter()
        .map(|source| (source.hash.as_str(), source.data.len() as i64))
        .chain(std::iter::once((
            assets.canonical_hash.as_str(),
            assets.canonical_bytes.len() as i64,
        )))
        .chain(std::iter::once((
            assets.thumbnail_hash.as_str(),
            assets.thumbnail_bytes.len() as i64,
        )))
        .collect::<Vec<_>>();
    let mut evicted = Vec::new();

    loop {
        let used: i64 = conn.query_row(
            "SELECT COALESCE(SUM(byte_length), 0) FROM binary_blobs",
            [],
            |row| row.get(0),
        )?;
        let mut seen = std::collections::HashSet::new();
        let mut required = 0i64;
        for (hash, length) in &incoming {
            if seen.insert(*hash)
                && conn.query_row(
                    "SELECT NOT EXISTS(SELECT 1 FROM binary_blobs WHERE sha256 = ?1)",
                    [*hash],
                    |row| row.get::<_, bool>(0),
                )?
            {
                required = required.saturating_add(*length);
            }
        }
        if used.saturating_add(required) <= budget {
            return Ok(evicted);
        }

        let candidate = conn
            .query_row(
                "SELECT id FROM clipboard_items
                 WHERE content_type = 'image' AND is_favorited = 0
                   AND (?1 IS NULL OR id != ?1)
                 ORDER BY last_used_at ASC, created_at ASC, id ASC LIMIT 1",
                [protected_item_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?;
        let Some(candidate) = candidate else {
            return Err(AppError::Database(format!(
                "image storage capacity exceeded: {} bytes are required but the {} byte budget is occupied by protected items",
                used.saturating_add(required),
                budget
            )));
        };
        conn.execute("DELETE FROM clipboard_items WHERE id = ?1", [candidate])?;
        crate::database::productization::cleanup_unreferenced_blobs_locked(conn)?;
        evicted.push(candidate);
    }
}

#[cfg(test)]
mod image_storage_tests {
    use super::*;
    use crate::database::types::{NewClipboardItem, NewImageRepresentation};
    use rusqlite::Connection;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn png(width: u32, height: u32, rgba: [u8; 4]) -> Vec<u8> {
        let image = image::RgbaImage::from_pixel(width, height, image::Rgba(rgba));
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn jpeg_and_canonical(width: u32, height: u32) -> (Vec<u8>, Vec<u8>) {
        let mut image = image::RgbaImage::new(width, height);
        for (x, y, pixel) in image.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x * 31) as u8, (y * 47) as u8, ((x + y) * 19) as u8, 255]);
        }
        let mut jpeg = Vec::new();
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut jpeg), image::ImageFormat::Jpeg)
            .unwrap();
        let decoded = image::load_from_memory_with_format(&jpeg, image::ImageFormat::Jpeg)
            .unwrap()
            .to_rgba8();
        let mut canonical = Vec::new();
        image::DynamicImage::ImageRgba8(decoded)
            .write_to(&mut Cursor::new(&mut canonical), image::ImageFormat::Png)
            .unwrap();
        (jpeg, canonical)
    }

    fn image_item(
        hash: &str,
        canonical: Vec<u8>,
        image_sources: Vec<NewImageRepresentation>,
    ) -> NewClipboardItem {
        NewClipboardItem {
            content_type: ContentType::Image,
            size: canonical.len() as i64,
            data: canonical,
            preview: Some("image fixture".into()),
            hash: hash.into(),
            metadata: None,
            formats: Vec::new(),
            image_sources,
        }
    }

    fn set_raw_budget(db: &Database, budget: i64) {
        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE app_config SET value = ?1 WHERE key = ?2",
            rusqlite::params![budget.to_string(), registry::KEY_IMAGE_BUDGET_BYTES],
        )
        .unwrap();
    }

    fn asset_bytes(assets: &PreparedImageAssets) -> i64 {
        let mut unique = std::collections::HashMap::new();
        for source in &assets.sources {
            unique.insert(source.hash.as_str(), source.data.len() as i64);
        }
        unique.insert(
            assets.canonical_hash.as_str(),
            assets.canonical_bytes.len() as i64,
        );
        unique.insert(
            assets.thumbnail_hash.as_str(),
            assets.thumbnail_bytes.len() as i64,
        );
        unique.values().sum()
    }

    #[test]
    fn encoded_source_bytes_are_preserved_with_pixel_equal_canonical_and_isolated_thumbnail() {
        let db = test_db();
        let (jpeg, canonical) = jpeg_and_canonical(8, 6);
        let item = image_item(
            "jpeg-fidelity",
            canonical.clone(),
            vec![NewImageRepresentation {
                format_name: "jpeg".into(),
                mime_type: Some("image/jpeg".into()),
                clipboard_format: Some("JFIF".into()),
                data: jpeg.clone(),
                metadata: None,
            }],
        );
        let saved = insert(&db, &item).unwrap();

        let source = crate::database::productization::get_image_representation(
            &db,
            saved.id,
            Some("source"),
        )
        .unwrap();
        let stored_canonical = crate::database::productization::get_image_representation(
            &db,
            saved.id,
            Some("canonical"),
        )
        .unwrap();
        let thumbnail =
            crate::database::productization::get_image_thumbnail(&db, saved.id).unwrap();

        assert_eq!(source, jpeg);
        assert_eq!(stored_canonical, canonical);
        assert_eq!(
            image::load_from_memory(&source).unwrap().to_rgba8(),
            image::load_from_memory(&stored_canonical)
                .unwrap()
                .to_rgba8()
        );
        assert_ne!(thumbnail, source);
        assert_eq!(
            crate::database::productization::get_image_representation(
                &db,
                saved.id,
                Some("source")
            )
            .unwrap(),
            jpeg
        );
    }

    #[test]
    fn raw_dibv5_source_is_preserved_without_becoming_the_canonical_png() {
        let db = test_db();
        let canonical = png(1, 1, [7, 8, 9, 128]);
        let mut dib = vec![0u8; 128];
        dib[0..4].copy_from_slice(&124u32.to_le_bytes());
        dib[4..8].copy_from_slice(&1i32.to_le_bytes());
        dib[8..12].copy_from_slice(&(-1i32).to_le_bytes());
        dib[12..14].copy_from_slice(&1u16.to_le_bytes());
        dib[14..16].copy_from_slice(&32u16.to_le_bytes());
        dib[124..128].copy_from_slice(&[9, 8, 7, 128]);
        let item = image_item(
            "dib-fidelity",
            canonical.clone(),
            vec![NewImageRepresentation {
                format_name: "dibv5".into(),
                mime_type: None,
                clipboard_format: Some("CF_DIBV5".into()),
                data: dib.clone(),
                metadata: Some(r#"{"rawBitmap":true}"#.into()),
            }],
        );
        let saved = insert(&db, &item).unwrap();

        assert_eq!(
            crate::database::productization::get_image_representation(
                &db,
                saved.id,
                Some("source")
            )
            .unwrap(),
            dib
        );
        assert_eq!(
            crate::database::productization::get_image_representation(
                &db,
                saved.id,
                Some("canonical")
            )
            .unwrap(),
            canonical
        );
    }

    #[test]
    fn capacity_evicts_oldest_unfavorited_image_and_reports_its_id() {
        let db = test_db();
        let first_png = png(4, 4, [10, 20, 30, 255]);
        let second_png = png(4, 4, [40, 50, 60, 255]);
        let first_assets = prepare_image_assets(&first_png, &[]).unwrap();
        let second_assets = prepare_image_assets(&second_png, &[]).unwrap();
        let budget = asset_bytes(&first_assets).max(asset_bytes(&second_assets));
        let first = insert(&db, &image_item("budget-first", first_png, Vec::new())).unwrap();
        set_raw_budget(&db, budget);

        let outcome = insert_with_source_outcome(
            &db,
            &image_item("budget-second", second_png, Vec::new()),
            None,
            None,
        )
        .unwrap();

        assert_eq!(outcome.evicted_image_ids, vec![first.id]);
        assert!(get_by_id(&db, first.id).unwrap().is_none());
        assert!(get_by_id(&db, outcome.item.id).unwrap().is_some());
    }

    #[test]
    fn capacity_never_evicts_favorites_and_rolls_back_the_new_capture() {
        let db = test_db();
        let first_png = png(4, 4, [70, 80, 90, 255]);
        let second_png = png(4, 4, [100, 110, 120, 255]);
        let budget = asset_bytes(&prepare_image_assets(&first_png, &[]).unwrap());
        let first = insert(&db, &image_item("favorite-first", first_png, Vec::new())).unwrap();
        toggle_favorite(&db, first.id).unwrap();
        set_raw_budget(&db, budget);

        let result = insert(&db, &image_item("favorite-second", second_png, Vec::new()));

        assert!(
            matches!(result, Err(AppError::Database(message)) if message.contains("protected items"))
        );
        assert!(get_by_id(&db, first.id).unwrap().unwrap().is_favorited);
        assert_eq!(get_list(&db, 10, 0).unwrap().len(), 1);
    }

    #[test]
    fn corrupted_blob_returns_a_locatable_integrity_error() {
        let db = test_db();
        let saved = insert(
            &db,
            &image_item("corrupt-image", png(2, 2, [1, 2, 3, 4]), Vec::new()),
        )
        .unwrap();
        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE binary_blobs SET content = X'00' WHERE sha256 = (
               SELECT blob_sha256 FROM clipboard_item_representations
               WHERE item_id = ?1 AND role = 'canonical' LIMIT 1
             )",
            [saved.id],
        )
        .unwrap();
        drop(conn);

        let error = crate::database::productization::get_image_representation(
            &db,
            saved.id,
            Some("canonical"),
        )
        .unwrap_err();
        assert!(error.to_string().contains("integrity check failed"));
    }

    #[test]
    fn missing_blob_returns_a_locatable_error_without_hiding_the_item() {
        let db = test_db();
        let saved = insert(
            &db,
            &image_item("missing-image", png(2, 2, [4, 3, 2, 1]), Vec::new()),
        )
        .unwrap();
        let conn = db.get_connection().unwrap();
        let canonical_hash: String = conn
            .query_row(
                "SELECT blob_sha256 FROM clipboard_item_representations
                 WHERE item_id = ?1 AND role = 'canonical' LIMIT 1",
                [saved.id],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute_batch("PRAGMA foreign_keys=OFF;").unwrap();
        conn.execute(
            "DELETE FROM binary_blobs WHERE sha256 = ?1",
            [canonical_hash],
        )
        .unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        drop(conn);

        let error = crate::database::productization::get_image_representation(
            &db,
            saved.id,
            Some("canonical"),
        )
        .unwrap_err();
        assert!(error.to_string().contains("is missing"));
        assert!(get_by_id(&db, saved.id).unwrap().is_some());
    }

    #[test]
    fn four_k_canonical_image_is_stored_without_the_legacy_five_mib_gate() {
        let db = test_db();
        let canonical = png(3840, 2160, [11, 22, 33, 128]);
        let saved = insert(
            &db,
            &image_item("four-k-image", canonical.clone(), Vec::new()),
        )
        .unwrap();

        let media = saved.media.expect("image rows expose media metadata");
        assert_eq!((media.width, media.height), (3840, 2160));
        assert_eq!(
            crate::database::productization::get_image_representation(
                &db,
                saved.id,
                Some("canonical"),
            )
            .unwrap(),
            canonical
        );
    }
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
