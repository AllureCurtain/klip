use crate::database::types::{ClipboardItem, ContentType, Tag};
use crate::{AppError, Database};
use rusqlite::types::Value;
use rusqlite::{params_from_iter, OptionalExtension};

const CLIPBOARD_ITEM_COLUMNS: &str =
    "id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at, is_sensitive, sensitivity_reason";
const CLIPBOARD_ITEM_ORDER_BY: &str = " ORDER BY last_used_at DESC, created_at DESC";

#[derive(Debug, Clone)]
pub struct ClipboardQuerySpec {
    pub text_query: Option<String>,
    pub text_match_ids: Option<Vec<i64>>,
    pub content_type: Option<String>,
    pub favorite_only: bool,
    pub sensitive_only: Option<bool>,
    pub tag_id: Option<i64>,
    pub exact_match: bool,
    pub created_after: Option<i64>,
    pub created_before: Option<i64>,
    pub limit: i64,
    pub offset: i64,
}

impl ClipboardQuerySpec {
    pub fn new(limit: i64, offset: i64) -> Self {
        Self {
            text_query: None,
            text_match_ids: None,
            content_type: None,
            favorite_only: false,
            sensitive_only: None,
            tag_id: None,
            exact_match: false,
            created_after: None,
            created_before: None,
            limit,
            offset,
        }
    }

    pub fn all_items() -> Self {
        Self::new(i64::MAX, 0)
    }
}

#[derive(Debug)]
struct BuiltClipboardQuery {
    sql: String,
    params: Vec<Value>,
}

pub(crate) fn fetch_items(
    db: &Database,
    spec: &ClipboardQuerySpec,
) -> Result<Vec<ClipboardItem>, AppError> {
    let resolved = resolve_full_text_search(db, spec);
    let conn = db.get_connection()?;
    fetch_items_locked(&conn, &resolved)
}

pub(crate) fn fetch_items_locked(
    conn: &rusqlite::Connection,
    spec: &ClipboardQuerySpec,
) -> Result<Vec<ClipboardItem>, AppError> {
    let built = build_clipboard_query(spec);
    let mut stmt = conn.prepare(&built.sql)?;
    let mut items = stmt
        .query_map(params_from_iter(built.params), |row| {
            Ok(clipboard_item_from_row(row))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    crate::database::formats::hydrate(conn, &mut items)?;
    Ok(items)
}

pub(crate) fn fetch_items_with_tags(
    db: &Database,
    spec: &ClipboardQuerySpec,
) -> Result<Vec<ClipboardItem>, AppError> {
    let resolved = resolve_full_text_search(db, spec);
    let conn = db.get_connection()?;
    fetch_items_with_tags_locked(&conn, &resolved)
}

pub(crate) fn fetch_items_with_tags_locked(
    conn: &rusqlite::Connection,
    spec: &ClipboardQuerySpec,
) -> Result<Vec<ClipboardItem>, AppError> {
    let mut items = fetch_items_locked(conn, spec)?;
    hydrate_tags(conn, &mut items)?;
    Ok(items)
}

pub(crate) fn fetch_item_by_id(db: &Database, id: i64) -> Result<Option<ClipboardItem>, AppError> {
    let conn = db.get_connection()?;
    fetch_item_by_id_locked(&conn, id)
}

pub(crate) fn fetch_item_by_id_locked(
    conn: &rusqlite::Connection,
    id: i64,
) -> Result<Option<ClipboardItem>, AppError> {
    let mut stmt = conn.prepare(&format!("{} WHERE id = ?1", clipboard_item_select_sql()))?;
    let mut item = stmt
        .query_row([id], |row| Ok(clipboard_item_from_row(row)))
        .optional()?;
    if let Some(item) = item.as_mut() {
        crate::database::formats::hydrate(conn, std::slice::from_mut(item))?;
    }
    Ok(item)
}

pub(crate) fn fetch_item_by_id_required_locked(
    conn: &rusqlite::Connection,
    id: i64,
) -> Result<ClipboardItem, AppError> {
    let mut stmt = conn.prepare(&format!("{} WHERE id = ?1", clipboard_item_select_sql()))?;
    let mut item = stmt.query_row([id], |row| Ok(clipboard_item_from_row(row)))?;
    crate::database::formats::hydrate(conn, std::slice::from_mut(&mut item))?;
    Ok(item)
}

pub(crate) fn fetch_item_by_hash_locked(
    conn: &rusqlite::Connection,
    hash: &str,
) -> Result<ClipboardItem, AppError> {
    let mut stmt = conn.prepare(&format!("{} WHERE hash = ?1", clipboard_item_select_sql()))?;
    let mut item = stmt.query_row([hash], |row| Ok(clipboard_item_from_row(row)))?;
    crate::database::formats::hydrate(conn, std::slice::from_mut(&mut item))?;
    Ok(item)
}

pub(crate) fn hydrate_tags(
    conn: &rusqlite::Connection,
    items: &mut [ClipboardItem],
) -> Result<(), AppError> {
    if items.is_empty() {
        return Ok(());
    }

    let item_ids = items.iter().map(|item| item.id).collect::<Vec<_>>();
    let placeholders = (0..item_ids.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT it.item_id, t.id, t.name, t.color, t.created_at
         FROM clipboard_item_tags it
         JOIN tags t ON it.tag_id = t.id
         WHERE it.item_id IN ({})
         ORDER BY it.item_id, t.name COLLATE NOCASE",
        placeholders
    );

    let mut tags_by_item =
        std::collections::HashMap::<i64, Vec<Tag>>::with_capacity(item_ids.len());
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(item_ids), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            Tag {
                id: row.get(1)?,
                name: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            },
        ))
    })?;

    for row in rows {
        let (item_id, tag) = row?;
        tags_by_item.entry(item_id).or_default().push(tag);
    }

    for item in items {
        item.tags = tags_by_item.remove(&item.id).unwrap_or_default();
    }
    Ok(())
}

fn build_clipboard_query(spec: &ClipboardQuerySpec) -> BuiltClipboardQuery {
    let mut sql = clipboard_item_select_sql();
    let mut clauses = Vec::new();
    let mut params = Vec::new();

    if let Some(text_query) = spec.text_query.as_deref() {
        let pattern = if spec.exact_match {
            text_query.to_string()
        } else {
            format!("%{}%", text_query)
        };
        let placeholder = push_param(&mut params, Value::Text(pattern));
        let content_clause = if spec.exact_match { "=" } else { "LIKE" };
        clauses.push(format!(
            "(preview {op} {p} OR (content_type != 'image' AND content {op} {p}))",
            op = content_clause,
            p = placeholder
        ));
    }

    if let Some(item_ids) = spec.text_match_ids.as_deref() {
        let item_ids_json = match serde_json::to_string(item_ids) {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!("Failed to encode full-text search IDs: {error}");
                "[]".to_string()
            }
        };
        let placeholder = push_param(&mut params, Value::Text(item_ids_json));
        clauses.push(format!(
            "id IN (SELECT CAST(value AS INTEGER) FROM json_each({placeholder}))"
        ));
    }

    if let Some(content_type) = spec.content_type.as_deref() {
        let placeholder = push_param(&mut params, Value::Text(content_type.to_string()));
        clauses.push(format!("content_type = {placeholder}"));
    }

    if spec.favorite_only {
        clauses.push("is_favorited = 1".to_string());
    }

    if let Some(sensitive_only) = spec.sensitive_only {
        let placeholder = push_param(&mut params, Value::Integer(sensitive_only as i64));
        clauses.push(format!("is_sensitive = {placeholder}"));
    }

    if let Some(tag_id) = spec.tag_id {
        let placeholder = push_param(&mut params, Value::Integer(tag_id));
        clauses.push(format!(
            "id IN (SELECT item_id FROM clipboard_item_tags WHERE tag_id = {placeholder})"
        ));
    }

    if let Some(created_after) = spec.created_after {
        let placeholder = push_param(&mut params, Value::Integer(created_after));
        clauses.push(format!("created_at >= {placeholder}"));
    }

    if let Some(created_before) = spec.created_before {
        let placeholder = push_param(&mut params, Value::Integer(created_before));
        clauses.push(format!("created_at <= {placeholder}"));
    }

    if !clauses.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&clauses.join(" AND "));
    }
    sql.push_str(CLIPBOARD_ITEM_ORDER_BY);
    sql.push_str(" LIMIT ");
    sql.push_str(&push_param(&mut params, Value::Integer(spec.limit)));
    sql.push_str(" OFFSET ");
    sql.push_str(&push_param(&mut params, Value::Integer(spec.offset)));

    BuiltClipboardQuery { sql, params }
}

fn resolve_full_text_search(db: &Database, spec: &ClipboardQuerySpec) -> ClipboardQuerySpec {
    let mut resolved = spec.clone();
    let Some(query) = spec
        .text_query
        .as_deref()
        .filter(|query| !query.trim().is_empty() && !spec.exact_match)
    else {
        return resolved;
    };

    match crate::search::search_ids(db, query) {
        Ok(item_ids) => {
            resolved.text_query = None;
            resolved.text_match_ids = Some(item_ids);
        }
        Err(error) => tracing::warn!(
            "Full-text search failed for query {:?}: {}; falling back to SQLite LIKE",
            query,
            error
        ),
    }
    resolved
}

fn push_param(params: &mut Vec<Value>, value: Value) -> String {
    params.push(value);
    format!("?{}", params.len())
}

fn clipboard_item_select_sql() -> String {
    format!("SELECT {CLIPBOARD_ITEM_COLUMNS} FROM clipboard_items")
}

fn clipboard_item_from_row(row: &rusqlite::Row<'_>) -> ClipboardItem {
    let content_type_str: String = row.get(1).unwrap_or_default();
    ClipboardItem {
        id: row.get(0).unwrap_or(0),
        content_type: ContentType::from_db(&content_type_str),
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
        formats: Vec::new(),
        tags: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use rusqlite::Connection;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_item(
        conn: &Connection,
        content_type: &str,
        preview: Option<&str>,
        content: &str,
        hash: &str,
        created_at: i64,
        last_used_at: i64,
    ) {
        conn.execute(
            "INSERT INTO clipboard_items
             (content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at, is_sensitive, sensitivity_reason)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0, ?6, ?7, 0, NULL)",
            rusqlite::params![
                content_type,
                content,
                preview,
                hash,
                content.len() as i64,
                created_at,
                last_used_at,
            ],
        )
        .unwrap();
    }

    fn set_item_flags(conn: &Connection, hash: &str, is_favorited: bool, is_sensitive: bool) {
        conn.execute(
            "UPDATE clipboard_items
             SET is_favorited = ?1, is_sensitive = ?2
             WHERE hash = ?3",
            rusqlite::params![is_favorited as i64, is_sensitive as i64, hash],
        )
        .unwrap();
    }

    fn create_tag(conn: &Connection, name: &str) -> i64 {
        conn.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, NULL, 1)",
            [name],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn assign_tag(conn: &Connection, hash: &str, tag_id: i64) {
        let item_id: i64 = conn
            .query_row(
                "SELECT id FROM clipboard_items WHERE hash = ?1",
                [hash],
                |row| row.get(0),
            )
            .unwrap();
        conn.execute(
            "INSERT INTO clipboard_item_tags (item_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![item_id, tag_id],
        )
        .unwrap();
    }

    #[test]
    fn build_clipboard_query_preserves_parameter_order() {
        let spec = ClipboardQuerySpec {
            text_query: Some("hello".into()),
            text_match_ids: None,
            content_type: Some("image".into()),
            favorite_only: true,
            sensitive_only: Some(false),
            tag_id: Some(7),
            exact_match: true,
            created_after: Some(100),
            created_before: Some(200),
            limit: 25,
            offset: 10,
        };

        let query = build_clipboard_query(&spec);
        assert_eq!(
            query.sql,
            "SELECT id, content_type, content, preview, hash, size, metadata, is_favorited, created_at, last_used_at, is_sensitive, sensitivity_reason FROM clipboard_items WHERE (preview = ?1 OR (content_type != 'image' AND content = ?1)) AND content_type = ?2 AND is_favorited = 1 AND is_sensitive = ?3 AND id IN (SELECT item_id FROM clipboard_item_tags WHERE tag_id = ?4) AND created_at >= ?5 AND created_at <= ?6 ORDER BY last_used_at DESC, created_at DESC LIMIT ?7 OFFSET ?8"
        );
        assert_eq!(
            query.params,
            vec![
                Value::Text("hello".into()),
                Value::Text("image".into()),
                Value::Integer(0),
                Value::Integer(7),
                Value::Integer(100),
                Value::Integer(200),
                Value::Integer(25),
                Value::Integer(10),
            ]
        );
    }

    #[test]
    fn fetch_items_applies_filter_set_ordering_and_pagination() {
        let db = test_db();
        let conn = db.get_connection().unwrap();
        insert_item(
            &conn,
            "text",
            Some("exact target"),
            "exact target",
            "old-match",
            1_000,
            1_000,
        );
        insert_item(
            &conn,
            "text",
            Some("exact target"),
            "exact target",
            "newest-match",
            2_000,
            3_000,
        );
        insert_item(
            &conn,
            "text",
            Some("exact target with suffix"),
            "exact target with suffix",
            "inexact",
            2_500,
            4_000,
        );
        insert_item(
            &conn,
            "image",
            Some("exact target"),
            "exact target",
            "wrong-type",
            2_000,
            2_000,
        );
        let tag_id = create_tag(&conn, "Work");
        for hash in ["old-match", "newest-match", "inexact", "wrong-type"] {
            set_item_flags(&conn, hash, true, true);
            assign_tag(&conn, hash, tag_id);
        }
        drop(conn);

        let spec = ClipboardQuerySpec {
            text_query: Some("exact target".into()),
            text_match_ids: None,
            content_type: Some("text".into()),
            favorite_only: true,
            sensitive_only: Some(true),
            tag_id: Some(tag_id),
            exact_match: true,
            created_after: Some(1_000),
            created_before: Some(3_000),
            limit: 1,
            offset: 0,
        };
        let first_page = fetch_items_with_tags(&db, &spec).unwrap();

        assert_eq!(first_page.len(), 1);
        assert_eq!(first_page[0].hash, "newest-match");
        assert_eq!(first_page[0].tags.len(), 1);
        assert_eq!(first_page[0].tags[0].name, "Work");

        let second_page =
            fetch_items_with_tags(&db, &ClipboardQuerySpec { offset: 1, ..spec }).unwrap();

        assert_eq!(second_page.len(), 1);
        assert_eq!(second_page[0].hash, "old-match");
    }

    #[test]
    fn fetch_items_with_tags_hydrates_tags_for_multiple_items() {
        let db = test_db();
        let conn = db.get_connection().unwrap();
        insert_item(
            &conn,
            "text",
            Some("alpha"),
            "alpha",
            "hash-alpha",
            1_000,
            1_000,
        );
        insert_item(
            &conn,
            "text",
            Some("beta"),
            "beta",
            "hash-beta",
            2_000,
            2_000,
        );
        let work = create_tag(&conn, "Work");
        let personal = create_tag(&conn, "Personal");
        assign_tag(&conn, "hash-alpha", work);
        assign_tag(&conn, "hash-beta", personal);
        drop(conn);

        let items = fetch_items_with_tags(&db, &ClipboardQuerySpec::new(10, 0)).unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].hash, "hash-beta");
        assert_eq!(items[0].tags[0].name, "Personal");
        assert_eq!(items[1].hash, "hash-alpha");
        assert_eq!(items[1].tags[0].name, "Work");
    }

    #[test]
    fn fetch_items_keeps_image_base64_content_out_of_text_search() {
        let db = test_db();
        let conn = db.get_connection().unwrap();
        insert_item(
            &conn,
            "text",
            Some("plain text preview"),
            "abc",
            "text-hash",
            1_000,
            1_000,
        );
        insert_item(
            &conn,
            "image",
            Some("image preview"),
            "data:image/png;base64,abc",
            "image-hash",
            2_000,
            2_000,
        );
        drop(conn);

        let mut spec = ClipboardQuerySpec::new(10, 0);
        spec.text_query = Some("abc".into());
        let results = fetch_items(&db, &spec).unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content_type, ContentType::Text);
        assert_eq!(results[0].hash, "text-hash");
    }

    #[test]
    fn fetch_items_with_empty_query_still_applies_preview_filter() {
        let db = test_db();
        let conn = db.get_connection().unwrap();
        insert_item(
            &conn,
            "image",
            None,
            "data:image/png;base64,abc",
            "image-hash",
            1_000,
            1_000,
        );
        drop(conn);

        let mut spec = ClipboardQuerySpec::new(10, 0);
        spec.text_query = Some(String::new());
        let results = fetch_items(&db, &spec).unwrap();

        assert!(results.is_empty());
    }
}
