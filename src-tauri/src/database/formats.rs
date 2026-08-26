use crate::database::types::{ClipboardFormat, ClipboardFormatType, ClipboardItem, ContentType};
use crate::AppError;
use rusqlite::Connection;

pub(crate) fn replace_for_item(
    conn: &Connection,
    item_id: i64,
    content_type: ContentType,
    plain_content: &str,
    formats: &[ClipboardFormat],
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM clipboard_formats WHERE item_id = ?1",
        [item_id],
    )?;

    if content_type != ContentType::Text {
        return Ok(());
    }

    insert_or_update(conn, item_id, ClipboardFormatType::Text, plain_content)?;
    for format in formats {
        if format.format != ClipboardFormatType::Text && !format.content.is_empty() {
            insert_or_update(conn, item_id, format.format, &format.content)?;
        }
    }
    Ok(())
}

fn insert_or_update(
    conn: &Connection,
    item_id: i64,
    format: ClipboardFormatType,
    content: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO clipboard_formats (item_id, format, content)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(item_id, format) DO UPDATE SET content = excluded.content",
        rusqlite::params![item_id, format.as_str(), content],
    )?;
    Ok(())
}

pub(crate) fn hydrate(conn: &Connection, items: &mut [ClipboardItem]) -> Result<(), AppError> {
    if items.is_empty() {
        return Ok(());
    }

    let item_ids = items.iter().map(|item| item.id).collect::<Vec<_>>();
    let placeholders = (0..item_ids.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT item_id, format, content
         FROM clipboard_formats
         WHERE item_id IN ({placeholders})
         ORDER BY item_id, CASE format WHEN 'text' THEN 0 WHEN 'html' THEN 1 ELSE 2 END"
    );

    let mut formats_by_item =
        std::collections::HashMap::<i64, Vec<ClipboardFormat>>::with_capacity(item_ids.len());
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(item_ids), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;

    for row in rows {
        let (item_id, format, content) = row?;
        let Some(format) = ClipboardFormatType::from_db(&format) else {
            tracing::warn!("Ignoring unsupported clipboard format {format:?} for item {item_id}");
            continue;
        };
        formats_by_item
            .entry(item_id)
            .or_default()
            .push(ClipboardFormat { format, content });
    }

    for item in items {
        item.formats = formats_by_item.remove(&item.id).unwrap_or_default();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{ClipboardItem, Database, NewClipboardItem};

    fn test_db() -> Database {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let db = Database::from_conn(connection);
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn text_insert_synthesizes_plain_format_and_hydrates_rich_formats() {
        let db = test_db();
        let item = NewClipboardItem {
            content_type: ContentType::Text,
            data: b"plain".to_vec(),
            preview: Some("plain".into()),
            hash: "rich-format-hash".into(),
            size: 5,
            metadata: None,
            formats: vec![ClipboardFormat {
                format: ClipboardFormatType::Html,
                content: "<b>plain</b>".into(),
            }],
            image_sources: Vec::new(),
        };

        let saved = crate::database::clipboard::insert(&db, &item).unwrap();

        assert_eq!(
            saved.formats,
            vec![
                ClipboardFormat {
                    format: ClipboardFormatType::Text,
                    content: "plain".into(),
                },
                ClipboardFormat {
                    format: ClipboardFormatType::Html,
                    content: "<b>plain</b>".into(),
                },
            ]
        );
    }

    #[test]
    fn duplicate_plain_capture_replaces_stale_rich_formats() {
        let db = test_db();
        let mut item = NewClipboardItem {
            content_type: ContentType::Text,
            data: b"same".to_vec(),
            preview: Some("same".into()),
            hash: "same-format-hash".into(),
            size: 4,
            metadata: None,
            formats: vec![ClipboardFormat {
                format: ClipboardFormatType::Html,
                content: "<b>same</b>".into(),
            }],
            image_sources: Vec::new(),
        };
        crate::database::clipboard::insert(&db, &item).unwrap();
        item.formats.clear();

        let saved: ClipboardItem = crate::database::clipboard::insert(&db, &item).unwrap();

        assert_eq!(saved.formats.len(), 1);
        assert_eq!(saved.formats[0].format, ClipboardFormatType::Text);
    }
}
