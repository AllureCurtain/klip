use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension};

use crate::database::{ClipboardItem, ClipboardOcr, ContentType, OcrStatus};
use crate::{AppError, Database};

pub(crate) fn ensure_for_image(
    conn: &Connection,
    item_id: i64,
    content_type: ContentType,
    now: i64,
) -> Result<(), AppError> {
    if content_type != ContentType::Image {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO clipboard_ocr (item_id, status, text, error, updated_at)
         VALUES (?1, 'pending', '', NULL, ?2)
         ON CONFLICT(item_id) DO UPDATE SET
            status = 'pending', text = '', error = NULL, updated_at = excluded.updated_at
         WHERE clipboard_ocr.status = 'failed'",
        rusqlite::params![item_id, now],
    )?;
    Ok(())
}

pub(crate) fn restore_for_import(
    conn: &Connection,
    item_id: i64,
    content_type: ContentType,
    state: Option<&ClipboardOcr>,
    now: i64,
) -> Result<(), AppError> {
    if content_type != ContentType::Image {
        return Ok(());
    }

    match state {
        Some(state) => {
            conn.execute(
                "INSERT OR REPLACE INTO clipboard_ocr
                 (item_id, status, text, error, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    item_id,
                    state.status.as_str(),
                    state.text,
                    state.error,
                    state.updated_at,
                ],
            )?;
        }
        None => ensure_for_image(conn, item_id, content_type, now)?,
    }
    Ok(())
}

pub fn pending_item_ids(db: &Database) -> Result<Vec<i64>, AppError> {
    let conn = db.get_connection()?;
    let mut statement = conn.prepare(
        "SELECT item_id FROM clipboard_ocr
         WHERE status = 'pending'
         ORDER BY updated_at, item_id",
    )?;
    let item_ids = statement
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::from)?;
    Ok(item_ids)
}

pub fn get(db: &Database, item_id: i64) -> Result<Option<ClipboardOcr>, AppError> {
    let conn = db.get_connection()?;
    conn.query_row(
        "SELECT status, text, error, updated_at FROM clipboard_ocr WHERE item_id = ?1",
        [item_id],
        state_from_row,
    )
    .optional()
    .map_err(Into::into)
}

pub fn complete(db: &Database, item_id: i64, text: &str) -> Result<bool, AppError> {
    update_state(db, item_id, OcrStatus::Completed, text, None)
}

pub fn fail(db: &Database, item_id: i64, error: &str) -> Result<bool, AppError> {
    update_state(db, item_id, OcrStatus::Failed, "", Some(error))
}

fn update_state(
    db: &Database,
    item_id: i64,
    status: OcrStatus,
    text: &str,
    error: Option<&str>,
) -> Result<bool, AppError> {
    let conn = db.get_connection()?;
    let now = crate::now_millis();
    let updated = conn.execute(
        "UPDATE clipboard_ocr
         SET status = ?1, text = ?2, error = ?3, updated_at = ?4
         WHERE item_id = ?5 AND status = 'pending'",
        rusqlite::params![status.as_str(), text, error, now, item_id],
    )?;
    Ok(updated > 0)
}

pub(crate) fn hydrate(conn: &Connection, items: &mut [ClipboardItem]) -> Result<(), AppError> {
    let image_ids = items
        .iter()
        .filter(|item| item.content_type == ContentType::Image)
        .map(|item| item.id)
        .collect::<Vec<_>>();
    if image_ids.is_empty() {
        return Ok(());
    }

    let placeholders = (0..image_ids.len())
        .map(|index| format!("?{}", index + 1))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "SELECT item_id, status, text, error, updated_at
         FROM clipboard_ocr WHERE item_id IN ({placeholders})"
    );
    let mut statement = conn.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(image_ids), |row| {
        Ok((row.get::<_, i64>(0)?, state_from_row_at_offset(row, 1)?))
    })?;
    let mut states = HashMap::new();
    for row in rows {
        let (item_id, state) = row?;
        states.insert(item_id, state);
    }
    for item in items {
        item.ocr = states.remove(&item.id);
    }
    Ok(())
}

fn state_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ClipboardOcr> {
    state_from_row_at_offset(row, 0)
}

fn state_from_row_at_offset(
    row: &rusqlite::Row<'_>,
    offset: usize,
) -> rusqlite::Result<ClipboardOcr> {
    let status: String = row.get(offset)?;
    Ok(ClipboardOcr {
        status: OcrStatus::from_db(&status),
        text: row.get(offset + 1)?,
        error: row.get(offset + 2)?,
        updated_at: row.get(offset + 3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        let db = Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_image(db: &Database) -> ClipboardItem {
        let data = include_bytes!("../../tests/fixtures/ocr/chinese-text.png").to_vec();
        let item = crate::database::NewClipboardItem {
            content_type: ContentType::Image,
            size: data.len() as i64,
            data,
            preview: Some("image fixture".into()),
            hash: "ocr-image-fixture".into(),
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).unwrap()
    }

    #[test]
    fn image_insert_is_pending_and_completion_is_hydrated() {
        let db = test_db();
        let item = insert_image(&db);
        assert_eq!(
            item.ocr.as_ref().map(|ocr| ocr.status),
            Some(OcrStatus::Pending)
        );

        assert!(complete(&db, item.id, "离线识别文字").unwrap());
        let reloaded = crate::database::clipboard::get_by_id(&db, item.id)
            .unwrap()
            .unwrap();
        let updated_at = reloaded.ocr.as_ref().unwrap().updated_at;
        assert_eq!(
            reloaded.ocr,
            Some(ClipboardOcr {
                status: OcrStatus::Completed,
                text: "离线识别文字".into(),
                error: None,
                updated_at,
            })
        );
    }

    #[test]
    fn failed_image_is_requeued_when_captured_again() {
        let db = test_db();
        let item = insert_image(&db);
        assert!(fail(&db, item.id, "temporary inference failure").unwrap());

        let recaptured = insert_image(&db);
        assert_eq!(recaptured.id, item.id);
        assert_eq!(
            recaptured.ocr.as_ref().map(|ocr| ocr.status),
            Some(OcrStatus::Pending)
        );
        assert_eq!(
            recaptured.ocr.as_ref().and_then(|ocr| ocr.error.as_ref()),
            None
        );
    }
}
