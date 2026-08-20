use crate::database::clipboard_query::{self, ClipboardQuerySpec};
use crate::database::types::{
    AdvancedSearchQuery, ClipboardItem, ShortcutBinding, SourceRule, SourceRuleInput, StorageUsage,
    Tag, WindowState,
};
use crate::{AppError, Database};
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};
use std::io::Cursor;

#[derive(Debug, Clone)]
pub(crate) struct StoredImageRepresentation {
    pub format_name: String,
    pub clipboard_format: Option<String>,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct ImageWriteBundle {
    pub canonical_png: Vec<u8>,
    pub sources: Vec<StoredImageRepresentation>,
}

pub const SHORTCUT_ACTIONS: [&str; 10] = [
    "toggle_window",
    "quick_paste_1",
    "quick_paste_2",
    "quick_paste_3",
    "quick_paste_4",
    "quick_paste_5",
    "quick_paste_6",
    "quick_paste_7",
    "quick_paste_8",
    "quick_paste_9",
];

pub fn list_shortcut_bindings(db: &Database) -> Result<Vec<ShortcutBinding>, AppError> {
    let conn = db.get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT action_id, enabled, accelerator, updated_at
         FROM shortcut_bindings ORDER BY CASE action_id WHEN 'toggle_window' THEN 0 ELSE 1 END, action_id",
    )?;
    let mut bindings = stmt
        .query_map([], |row| {
            Ok(ShortcutBinding {
                action_id: row.get(0)?,
                enabled: row.get::<_, i64>(1)? != 0,
                accelerator: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    bindings.sort_by_key(|binding| {
        SHORTCUT_ACTIONS
            .iter()
            .position(|id| *id == binding.action_id)
            .unwrap_or(99)
    });
    Ok(bindings)
}

pub fn replace_shortcut_bindings(
    db: &Database,
    bindings: &[ShortcutBinding],
) -> Result<(), AppError> {
    if bindings.len() != SHORTCUT_ACTIONS.len() {
        return Err(AppError::InvalidInput(
            "all 10 shortcut actions are required".into(),
        ));
    }
    let mut seen = std::collections::HashSet::new();
    for binding in bindings {
        if !SHORTCUT_ACTIONS.contains(&binding.action_id.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "unknown shortcut action: {}",
                binding.action_id
            )));
        }
        if !seen.insert(binding.action_id.as_str()) {
            return Err(AppError::InvalidInput(format!(
                "duplicate shortcut action: {}",
                binding.action_id
            )));
        }
        if binding.enabled
            && binding
                .accelerator
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
        {
            return Err(AppError::InvalidInput(format!(
                "enabled shortcut {} has no accelerator",
                binding.action_id
            )));
        }
        if let Some(accelerator) = binding.accelerator.as_deref() {
            if accelerator.trim().is_empty() {
                return Err(AppError::InvalidInput(format!(
                    "shortcut {} has an empty accelerator",
                    binding.action_id
                )));
            }
        }
    }
    let mut accelerators = std::collections::HashSet::new();
    for binding in bindings.iter().filter(|binding| binding.enabled) {
        let accelerator = binding.accelerator.as_deref().unwrap();
        if !accelerators.insert(accelerator.to_ascii_lowercase()) {
            return Err(AppError::Hotkey(format!(
                "shortcut accelerator is duplicated: {}",
                accelerator
            )));
        }
    }
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM shortcut_bindings", [])?;
    for binding in bindings {
        tx.execute(
            "INSERT INTO shortcut_bindings (action_id, enabled, accelerator, updated_at) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![binding.action_id, binding.enabled as i64, binding.accelerator, now_millis()],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Database {
        let db = Database::from_conn(Connection::open_in_memory().unwrap());
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn shortcut_replacement_rolls_back_the_full_set_on_database_failure() {
        let db = test_db();
        let before = list_shortcut_bindings(&db).unwrap();
        {
            let conn = db.get_connection().unwrap();
            conn.execute_batch(
                "CREATE TRIGGER fail_shortcut_replace
                 BEFORE INSERT ON shortcut_bindings
                 WHEN NEW.action_id = 'quick_paste_5'
                 BEGIN SELECT RAISE(FAIL, 'injected shortcut write failure'); END;",
            )
            .unwrap();
        }
        let mut changed = before.clone();
        changed[0].accelerator = Some("Ctrl+Win+K".into());

        assert!(replace_shortcut_bindings(&db, &changed).is_err());
        assert_eq!(list_shortcut_bindings(&db).unwrap(), before);
    }
}

pub fn get_window_state(db: &Database, label: &str) -> Result<Option<WindowState>, AppError> {
    let conn = db.get_connection()?;
    Ok(conn.query_row(
        "SELECT window_label, width_dip, height_dip, x, y, monitor_id, scale_factor, updated_at FROM window_state WHERE window_label = ?1",
        [label],
        |row| Ok(WindowState { window_label: row.get(0)?, width_dip: row.get(1)?, height_dip: row.get(2)?, x: row.get(3)?, y: row.get(4)?, monitor_id: row.get(5)?, scale_factor: row.get(6)?, updated_at: row.get(7)? }),
    ).optional()?)
}

pub fn save_window_state(db: &Database, state: &WindowState) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute(
        "INSERT INTO window_state (window_label, width_dip, height_dip, x, y, monitor_id, scale_factor, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(window_label) DO UPDATE SET width_dip=excluded.width_dip, height_dip=excluded.height_dip,
         x=excluded.x, y=excluded.y, monitor_id=excluded.monitor_id, scale_factor=excluded.scale_factor, updated_at=excluded.updated_at",
        rusqlite::params![state.window_label, state.width_dip, state.height_dip, state.x, state.y, state.monitor_id, state.scale_factor, state.updated_at],
    )?;
    Ok(())
}

pub fn storage_usage(db: &Database) -> Result<StorageUsage, AppError> {
    let budget_bytes =
        crate::database::config::get(db, crate::config::registry::KEY_IMAGE_BUDGET_BYTES)?
            .and_then(|value| value.parse().ok());
    let conn = db.get_connection()?;
    let used_bytes = conn.query_row(
        "SELECT COALESCE(SUM(byte_length),0) FROM binary_blobs",
        [],
        |row| row.get(0),
    )?;
    let image_bytes = conn.query_row(
        "SELECT COALESCE(SUM(byte_length),0) FROM binary_blobs
         WHERE sha256 IN (SELECT DISTINCT blob_sha256 FROM clipboard_item_representations)",
        [],
        |row| row.get(0),
    )?;
    let blob_count = conn.query_row("SELECT COUNT(*) FROM binary_blobs", [], |row| row.get(0))?;
    Ok(StorageUsage {
        used_bytes,
        budget_bytes,
        image_bytes,
        blob_count,
    })
}

pub fn get_image_representation(
    db: &Database,
    item_id: i64,
    format: Option<&str>,
) -> Result<Vec<u8>, AppError> {
    let conn = db.get_connection()?;
    Ok(read_image_representation_locked(&conn, item_id, format)?.bytes)
}

pub fn get_image_thumbnail(db: &Database, item_id: i64) -> Result<Vec<u8>, AppError> {
    let mut conn = db.get_connection()?;
    if let Ok(thumbnail) = read_role_locked(&conn, item_id, "thumbnail") {
        return Ok(thumbnail.bytes);
    }

    let canonical = read_role_locked(&conn, item_id, "canonical")?;
    let decoded = image::load_from_memory_with_format(&canonical.bytes, image::ImageFormat::Png)
        .map_err(|error| {
            AppError::Clipboard(format!(
                "canonical image for item {item_id} cannot generate a thumbnail: {error}"
            ))
        })?;
    let thumbnail = decoded.thumbnail(192, 192);
    let (width, height) = (thumbnail.width() as i64, thumbnail.height() as i64);
    let mut bytes = Vec::new();
    thumbnail
        .write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|error| AppError::Clipboard(format!("thumbnail generation failed: {error}")))?;
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let now = now_millis();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT OR IGNORE INTO binary_blobs (sha256, byte_length, content, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![hash, bytes.len() as i64, bytes, now],
    )?;
    tx.execute(
        "INSERT OR REPLACE INTO clipboard_item_representations
         (item_id, blob_sha256, role, format_name, mime_type, width, height, byte_length, priority, metadata)
         VALUES (?1, ?2, 'thumbnail', 'png', 'image/png', ?3, ?4, ?5, 0, '{\"generated\":true,\"legacy\":true}')",
        rusqlite::params![item_id, hash, width, height, bytes.len() as i64],
    )?;
    tx.commit()?;
    Ok(bytes)
}

pub(crate) fn get_image_write_bundle(
    db: &Database,
    item_id: i64,
) -> Result<ImageWriteBundle, AppError> {
    let conn = db.get_connection()?;
    let canonical = read_role_locked(&conn, item_id, "canonical")?;
    let mut statement = conn.prepare(
        "SELECT r.blob_sha256, r.role, r.format_name, r.metadata,
                r.byte_length, b.byte_length, b.content
         FROM clipboard_item_representations r
         LEFT JOIN binary_blobs b ON b.sha256 = r.blob_sha256
         WHERE r.item_id = ?1 AND r.role = 'source'
         ORDER BY r.priority DESC, r.format_name",
    )?;
    let source_rows = statement
        .query_map([item_id], stored_representation_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    let sources = source_rows
        .into_iter()
        .map(validate_stored_representation)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ImageWriteBundle {
        canonical_png: canonical.bytes,
        sources,
    })
}

fn read_image_representation_locked(
    conn: &rusqlite::Connection,
    item_id: i64,
    selector: Option<&str>,
) -> Result<StoredImageRepresentation, AppError> {
    let selector = selector.map(str::trim).filter(|value| !value.is_empty());
    let row = conn
        .query_row(
            "SELECT r.blob_sha256, r.role, r.format_name, r.metadata,
                    r.byte_length, b.byte_length, b.content
             FROM clipboard_item_representations r
             LEFT JOIN binary_blobs b ON b.sha256 = r.blob_sha256
             WHERE r.item_id = ?1 AND r.role IN ('source','canonical')
               AND (
                 ?2 IS NULL
                 OR (?2 = 'source' AND r.role = 'source')
                 OR (?2 = 'canonical' AND r.role = 'canonical')
                 OR r.format_name = ?2
               )
             ORDER BY
               CASE
                 WHEN ?2 = 'canonical' AND r.role = 'canonical' THEN 0
                 WHEN ?2 = 'source' AND r.role = 'source' THEN 0
                 WHEN ?2 IS NULL AND r.role = 'source' THEN 0
                 WHEN r.format_name = ?2 THEN 0
                 ELSE 1
               END,
               r.priority DESC
             LIMIT 1",
            rusqlite::params![item_id, selector],
            stored_representation_from_row,
        )
        .optional()?
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "image representation for item {item_id} and selector {:?} not found",
                selector
            ))
        })?;
    validate_stored_representation(row)
}

fn read_role_locked(
    conn: &rusqlite::Connection,
    item_id: i64,
    role: &str,
) -> Result<StoredImageRepresentation, AppError> {
    let row = conn
        .query_row(
            "SELECT r.blob_sha256, r.role, r.format_name, r.metadata,
                    r.byte_length, b.byte_length, b.content
             FROM clipboard_item_representations r
             LEFT JOIN binary_blobs b ON b.sha256 = r.blob_sha256
             WHERE r.item_id = ?1 AND r.role = ?2
             ORDER BY r.priority DESC LIMIT 1",
            rusqlite::params![item_id, role],
            stored_representation_from_row,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("image {role} for item {item_id} not found")))?;
    validate_stored_representation(row)
}

struct StoredRepresentationRow {
    sha256: String,
    role: String,
    format_name: String,
    metadata: Option<String>,
    relation_length: i64,
    blob_length: Option<i64>,
    content: Option<Vec<u8>>,
}

fn stored_representation_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<StoredRepresentationRow> {
    Ok(StoredRepresentationRow {
        sha256: row.get(0)?,
        role: row.get(1)?,
        format_name: row.get(2)?,
        metadata: row.get(3)?,
        relation_length: row.get(4)?,
        blob_length: row.get(5)?,
        content: row.get(6)?,
    })
}

fn validate_stored_representation(
    row: StoredRepresentationRow,
) -> Result<StoredImageRepresentation, AppError> {
    let content = row.content.ok_or_else(|| {
        AppError::Database(format!(
            "image BLOB {} is missing for {} {} representation",
            row.sha256, row.role, row.format_name
        ))
    })?;
    let actual_hash = format!("{:x}", Sha256::digest(&content));
    if actual_hash != row.sha256
        || row.relation_length != content.len() as i64
        || row.blob_length != Some(content.len() as i64)
    {
        tracing::error!(
            "Image BLOB integrity failure: role={}, format={}, expected_hash={}, actual_hash={}, relation_length={}, blob_length={:?}, actual_length={}",
            row.role,
            row.format_name,
            row.sha256,
            actual_hash,
            row.relation_length,
            row.blob_length,
            content.len()
        );
        return Err(AppError::Database(format!(
            "image BLOB integrity check failed for {} {} representation ({})",
            row.role, row.format_name, row.sha256
        )));
    }
    let clipboard_format = row
        .metadata
        .as_deref()
        .and_then(|metadata| serde_json::from_str::<serde_json::Value>(metadata).ok())
        .and_then(|metadata| {
            metadata
                .get("clipboardFormat")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        });
    Ok(StoredImageRepresentation {
        format_name: row.format_name,
        clipboard_format,
        bytes: content,
    })
}

pub fn batch_delete(db: &Database, ids: &[i64]) -> Result<usize, AppError> {
    let mut conn = db.get_connection()?;
    let tx = conn.transaction()?;
    let mut count = 0;
    for id in ids {
        count += tx.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
    }
    cleanup_unreferenced_blobs_locked(&tx)?;
    tx.commit()?;
    drop(conn);
    if let Err(error) = crate::search::delete_items(db, ids) {
        tracing::warn!("Failed to batch-delete items from full-text search: {error}");
    }
    Ok(count)
}

pub(crate) fn cleanup_unreferenced_blobs_locked(
    conn: &rusqlite::Connection,
) -> Result<usize, AppError> {
    Ok(conn.execute(
        "DELETE FROM binary_blobs WHERE sha256 NOT IN (SELECT DISTINCT blob_sha256 FROM clipboard_item_representations)",
        [],
    )?)
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
    let mut spec = ClipboardQuerySpec::new(limit, offset);
    spec.content_type = content_type.map(|value| value.to_string());
    spec.favorite_only = favorite_only;
    spec.tag_id = tag_id;
    clipboard_query::fetch_items_with_tags(db, &spec)
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
    let mut spec = ClipboardQuerySpec::new(limit, offset);
    spec.text_query = Some(query.to_string());
    spec.content_type = content_type.map(|value| value.to_string());
    spec.favorite_only = favorite_only;
    spec.tag_id = tag_id;
    clipboard_query::fetch_items_with_tags(db, &spec)
}

pub fn search_advanced(
    db: &Database,
    query: AdvancedSearchQuery,
) -> Result<Vec<ClipboardItem>, AppError> {
    let trimmed = query.query.trim().to_string();
    let mut spec = ClipboardQuerySpec::new(query.limit, query.offset);
    if !trimmed.is_empty() {
        spec.text_query = Some(trimmed);
    }
    spec.exact_match = query.exact_match;
    spec.content_type = query.content_type;
    spec.favorite_only = query.favorite_only;
    spec.sensitive_only = query.sensitive_only;
    spec.tag_id = query.tag_id;
    spec.created_after = query.created_after;
    spec.created_before = query.created_before;
    clipboard_query::fetch_items_with_tags(db, &spec)
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

pub fn list_source_rules(db: &Database) -> Result<Vec<SourceRule>, AppError> {
    let conn = db.get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, match_type, pattern, enabled, created_at, updated_at
         FROM clipboard_source_rules
         ORDER BY enabled DESC, updated_at DESC",
    )?;
    let rules = stmt
        .query_map([], source_rule_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rules)
}

pub fn create_source_rule(db: &Database, input: SourceRuleInput) -> Result<SourceRule, AppError> {
    validate_source_rule_input(&input)?;
    let conn = db.get_connection()?;
    let now = now_millis();
    conn.execute(
        "INSERT INTO clipboard_source_rules
         (match_type, pattern, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![
            input.match_type.trim().to_ascii_lowercase(),
            input.pattern.trim(),
            input.enabled as i64,
            now,
        ],
    )?;
    get_source_rule_locked(&conn, conn.last_insert_rowid())
}

pub fn update_source_rule(
    db: &Database,
    id: i64,
    input: SourceRuleInput,
) -> Result<SourceRule, AppError> {
    validate_source_rule_input(&input)?;
    let conn = db.get_connection()?;
    let now = now_millis();
    let changed = conn.execute(
        "UPDATE clipboard_source_rules
         SET match_type = ?1, pattern = ?2, enabled = ?3, updated_at = ?4
         WHERE id = ?5",
        rusqlite::params![
            input.match_type.trim().to_ascii_lowercase(),
            input.pattern.trim(),
            input.enabled as i64,
            now,
            id,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("source rule {} not found", id)));
    }
    get_source_rule_locked(&conn, id)
}

pub fn set_source_rule_enabled(
    db: &Database,
    id: i64,
    enabled: bool,
) -> Result<SourceRule, AppError> {
    let conn = db.get_connection()?;
    let now = now_millis();
    let changed = conn.execute(
        "UPDATE clipboard_source_rules
         SET enabled = ?1, updated_at = ?2
         WHERE id = ?3",
        rusqlite::params![enabled as i64, now, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("source rule {} not found", id)));
    }
    get_source_rule_locked(&conn, id)
}

pub fn delete_source_rule(db: &Database, id: i64) -> Result<(), AppError> {
    let conn = db.get_connection()?;
    conn.execute("DELETE FROM clipboard_source_rules WHERE id = ?1", [id])?;
    Ok(())
}

pub fn source_should_be_ignored(
    db: &Database,
    process_name: Option<&str>,
    window_title: Option<&str>,
) -> Result<bool, AppError> {
    let rules = list_source_rules(db)?;
    let process = process_name.unwrap_or_default().to_ascii_lowercase();
    let title = window_title.unwrap_or_default().to_ascii_lowercase();

    Ok(rules.into_iter().any(|rule| {
        if !rule.enabled {
            return false;
        }
        let pattern = rule.pattern.to_ascii_lowercase();
        match rule.match_type.as_str() {
            "process" => process.contains(&pattern),
            "title" => title.contains(&pattern),
            "any" => process.contains(&pattern) || title.contains(&pattern),
            _ => false,
        }
    }))
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

fn has_long_token(content: &str) -> bool {
    content
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-' && c != '.')
        .any(|part| part.len() >= 32 && part.chars().filter(|c| c.is_ascii_digit()).count() >= 4)
}

fn validate_source_rule_input(input: &SourceRuleInput) -> Result<(), AppError> {
    let match_type = input.match_type.trim().to_ascii_lowercase();
    if !matches!(match_type.as_str(), "process" | "title" | "any") {
        return Err(AppError::InvalidInput(
            "source rule match_type must be process, title, or any".into(),
        ));
    }
    if input.pattern.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "source rule pattern cannot be empty".into(),
        ));
    }
    Ok(())
}

fn get_source_rule_locked(conn: &rusqlite::Connection, id: i64) -> Result<SourceRule, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, match_type, pattern, enabled, created_at, updated_at
         FROM clipboard_source_rules
         WHERE id = ?1",
    )?;
    stmt.query_row([id], source_rule_from_row)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("source rule {} not found", id))
            }
            other => other.into(),
        })
}

fn source_rule_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceRule> {
    Ok(SourceRule {
        id: row.get(0)?,
        match_type: row.get(1)?,
        pattern: row.get(2)?,
        enabled: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::types::{ContentType, NewClipboardItem, SnippetInput, SourceRuleInput};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_text(db: &Database, content: &str, created_at: i64) -> ClipboardItem {
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let item = NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.to_string()),
            hash,
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        };
        let saved = crate::database::clipboard::insert(db, &item).unwrap();
        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE clipboard_items SET created_at = ?1, last_used_at = ?1 WHERE id = ?2",
            rusqlite::params![created_at, saved.id],
        )
        .unwrap();
        drop(conn);
        crate::database::clipboard::get_by_id(db, saved.id)
            .unwrap()
            .unwrap()
    }

    #[test]
    fn schema_seeds_product_completion_defaults() {
        let db = test_db();
        let config = crate::database::config::get_all(&db).unwrap();

        assert_eq!(
            config.get("clipboard_monitor_enabled"),
            Some(&"true".to_string())
        );
        assert_eq!(config.get("privacy_mode_until"), Some(&"0".to_string()));
        assert_eq!(config.get("updates_enabled"), Some(&"false".to_string()));
        assert_eq!(config.get("encryption_status"), Some(&"off".to_string()));
        assert!(config.contains_key("sync_folder"));
        assert!(config.contains_key("plugin_folder"));
    }

    #[test]
    fn snippets_can_be_created_listed_searched_updated_and_deleted() {
        let db = test_db();

        let created = crate::database::snippets::create(
            &db,
            SnippetInput {
                title: "Deploy note".into(),
                content: "pnpm release:verify".into(),
                tag_id: None,
                is_favorited: true,
            },
        )
        .unwrap();

        assert_eq!(created.title, "Deploy note");
        assert!(created.is_favorited);

        let results = crate::database::snippets::search(&db, "release").unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, created.id);

        let updated = crate::database::snippets::update(
            &db,
            created.id,
            SnippetInput {
                title: "Release command".into(),
                content: "pnpm release:verify -SkipBundle".into(),
                tag_id: None,
                is_favorited: false,
            },
        )
        .unwrap();

        assert_eq!(updated.title, "Release command");
        assert!(!updated.is_favorited);

        crate::database::snippets::delete(&db, created.id).unwrap();
        assert!(crate::database::snippets::list(&db).unwrap().is_empty());
    }

    #[test]
    fn ipc_inputs_accept_frontend_camel_case_keys() {
        let snippet: SnippetInput = serde_json::from_value(serde_json::json!({
            "title": "Deploy",
            "content": "pnpm release:verify",
            "tagId": 12,
            "isFavorited": true
        }))
        .unwrap();

        assert_eq!(snippet.tag_id, Some(12));
        assert!(snippet.is_favorited);

        let rule: SourceRuleInput = serde_json::from_value(serde_json::json!({
            "matchType": "process",
            "pattern": "1Password.exe",
            "enabled": true
        }))
        .unwrap();

        assert_eq!(rule.match_type, "process");
        assert_eq!(rule.pattern, "1Password.exe");
        assert!(rule.enabled);
    }

    #[test]
    fn advanced_search_filters_by_sensitive_exact_and_date_range() {
        let db = test_db();
        let older = insert_text(&db, "token=alpha", 1_000);
        let newer = insert_text(&db, "token alphabet soup", 3_000);
        let tag = create_tag(&db, "Work", Some("#2563eb")).unwrap();
        assign_tag(&db, newer.id, tag.id).unwrap();
        let _ = older;
        rescan_sensitive(&db).unwrap();

        let results = search_advanced(
            &db,
            AdvancedSearchQuery {
                query: "token alphabet soup".into(),
                content_type: Some("text".into()),
                favorite_only: false,
                sensitive_only: Some(false),
                tag_id: Some(tag.id),
                exact_match: true,
                created_after: Some(2_000),
                created_before: Some(4_000),
                limit: 20,
                offset: 0,
            },
        )
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, newer.id);
        assert_eq!(results[0].tags.len(), 1);
        assert_eq!(results[0].tags[0].name, "Work");
    }

    #[test]
    fn source_rules_match_process_and_title_case_insensitively() {
        let db = test_db();
        let process_rule = create_source_rule(
            &db,
            SourceRuleInput {
                match_type: "process".into(),
                pattern: "1Password.exe".into(),
                enabled: true,
            },
        )
        .unwrap();
        let title_rule = create_source_rule(
            &db,
            SourceRuleInput {
                match_type: "title".into(),
                pattern: "Private Browsing".into(),
                enabled: true,
            },
        )
        .unwrap();

        assert!(source_should_be_ignored(&db, Some("1password.exe"), Some("Any Window")).unwrap());
        assert!(source_should_be_ignored(
            &db,
            Some("browser.exe"),
            Some("Docs - Private Browsing")
        )
        .unwrap());

        set_source_rule_enabled(&db, process_rule.id, false).unwrap();
        assert!(!source_should_be_ignored(&db, Some("1password.exe"), None).unwrap());

        delete_source_rule(&db, title_rule.id).unwrap();
        assert!(list_source_rules(&db).unwrap().len() == 1);
    }
}
