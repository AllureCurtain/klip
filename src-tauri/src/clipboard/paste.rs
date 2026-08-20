use crate::clipboard::writer::ClipboardWriteMode;
use crate::database::{self, ClipboardItem};
use crate::hotkey::visible_items::{position_offset, VisibleClipboardItems, VisibleItemAtPosition};
use crate::{AppError, Database};
use tauri::AppHandle;

pub fn copy_item_by_id(db: &Database, id: i64) -> Result<(), AppError> {
    let item = load_item_by_id(db, id)?;
    copy_loaded_item(db, &item, ClipboardWriteMode::PreserveFormats)
}

pub fn copy_item_as_plain_text_by_id(db: &Database, id: i64) -> Result<(), AppError> {
    let item = load_item_by_id(db, id)?;
    copy_loaded_item(db, &item, ClipboardWriteMode::PlainText)
}

pub fn paste_item_by_id(app: &AppHandle, db: &Database, id: i64) -> Result<(), AppError> {
    let item = load_item_by_id(db, id)?;
    copy_loaded_item_and_simulate_paste(app, db, &item, ClipboardWriteMode::PreserveFormats)
}

pub fn paste_item_as_plain_text_by_id(
    app: &AppHandle,
    db: &Database,
    id: i64,
) -> Result<(), AppError> {
    let item = load_item_by_id(db, id)?;
    copy_loaded_item_and_simulate_paste(app, db, &item, ClipboardWriteMode::PlainText)
}

pub fn quick_paste(
    app: &AppHandle,
    db: &Database,
    visible_items: &VisibleClipboardItems,
    index: i64,
) -> Result<bool, AppError> {
    match load_item_by_quick_paste_index(db, visible_items, index)? {
        Some(item) => {
            copy_item_and_simulate_paste(app, db, &item)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

pub fn copy_item_and_simulate_paste(
    app: &AppHandle,
    db: &Database,
    item: &ClipboardItem,
) -> Result<(), AppError> {
    copy_loaded_item_and_simulate_paste(app, db, item, ClipboardWriteMode::PreserveFormats)
}

fn copy_loaded_item_and_simulate_paste(
    app: &AppHandle,
    db: &Database,
    item: &ClipboardItem,
    mode: ClipboardWriteMode,
) -> Result<(), AppError> {
    copy_loaded_item(db, item, mode)?;
    crate::window::controller::hide_main_window(app)?;
    simulate_platform_paste()
}

pub(crate) fn quick_paste_offset(index: i64) -> Result<i64, AppError> {
    Ok(position_offset(index)? as i64)
}

pub(crate) fn load_item_by_id(db: &Database, id: i64) -> Result<ClipboardItem, AppError> {
    database::clipboard::get_by_id(db, id)?
        .ok_or_else(|| AppError::NotFound(format!("clipboard item {} not found", id)))
}

pub(crate) fn load_item_by_quick_paste_index(
    db: &Database,
    visible_items: &VisibleClipboardItems,
    index: i64,
) -> Result<Option<ClipboardItem>, AppError> {
    match visible_items.resolve(index)? {
        VisibleItemAtPosition::Uninitialized => {
            let offset = quick_paste_offset(index)?;
            Ok(database::clipboard::get_list(db, 1, offset)?
                .into_iter()
                .next())
        }
        VisibleItemAtPosition::Id(id) => database::clipboard::get_by_id(db, id),
        VisibleItemAtPosition::Missing => Ok(None),
    }
}

fn copy_loaded_item(
    db: &Database,
    item: &ClipboardItem,
    mode: ClipboardWriteMode,
) -> Result<(), AppError> {
    if item.content_type == crate::database::ContentType::Image {
        match crate::database::productization::get_image_write_bundle(db, item.id) {
            Ok(bundle) => {
                crate::clipboard::writer::copy_image_bundle_to_clipboard(&bundle, &item.hash)?
            }
            Err(AppError::NotFound(_)) => crate::clipboard::copy_to_clipboard(
                &item.content,
                &item.content_type,
                item.metadata.as_deref(),
                &item.formats,
                mode,
            )?,
            Err(error) => return Err(error),
        }
    } else {
        crate::clipboard::copy_to_clipboard(
            &item.content,
            &item.content_type,
            item.metadata.as_deref(),
            &item.formats,
            mode,
        )?;
    }
    let _ = database::clipboard::touch_last_used(db, item.id);
    Ok(())
}

fn simulate_platform_paste() -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::thread::sleep(std::time::Duration::from_millis(30));
        let _ = crate::restore_previous_foreground();
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
            use enigo::Keyboard;
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
            let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::thread::sleep(std::time::Duration::from_millis(30));
        let _ = crate::restore_previous_foreground();
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
            use enigo::Keyboard;
            let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Press);
            let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Release);
        }
        Ok(())
    }

    #[cfg(target_os = "linux")]
    {
        let _ = crate::restore_previous_foreground();
        crate::platform::linux::simulate_paste()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::types::{ContentType, NewClipboardItem};
    use crate::hotkey::visible_items::VisibleClipboardItems;
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

    fn insert_text_at_time(db: &Database, content: &str, ts: i64) -> ClipboardItem {
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
        let saved = database::clipboard::insert(db, &item).unwrap();
        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE clipboard_items SET created_at = ?1, last_used_at = ?1 WHERE id = ?2",
            rusqlite::params![ts, saved.id],
        )
        .unwrap();
        drop(conn);
        database::clipboard::get_by_id(db, saved.id)
            .unwrap()
            .unwrap()
    }

    #[test]
    fn quick_paste_index_uses_one_based_offset() {
        assert_eq!(quick_paste_offset(1).unwrap(), 0);
        assert_eq!(quick_paste_offset(9).unwrap(), 8);
        assert!(quick_paste_offset(0).is_err());
        assert!(quick_paste_offset(10).is_err());
    }

    #[test]
    fn load_item_by_id_selects_exact_item() {
        let db = test_db();
        let first = insert_text_at_time(&db, "first", 1_000);
        let second = insert_text_at_time(&db, "second", 2_000);

        let loaded = load_item_by_id(&db, first.id).unwrap();

        assert_eq!(loaded.id, first.id);
        assert_ne!(loaded.id, second.id);
    }

    #[test]
    fn missing_item_by_id_returns_not_found() {
        let db = test_db();

        let result = load_item_by_id(&db, 999);

        assert!(matches!(result, Err(AppError::NotFound(message)) if message.contains("999")));
    }

    #[test]
    fn uninitialized_visible_items_fall_back_to_database_order() {
        let db = test_db();
        let visible_items = VisibleClipboardItems::default();
        let older = insert_text_at_time(&db, "older", 1_000);
        let newest = insert_text_at_time(&db, "newest", 2_000);

        let first = load_item_by_quick_paste_index(&db, &visible_items, 1)
            .unwrap()
            .unwrap();
        let second = load_item_by_quick_paste_index(&db, &visible_items, 2)
            .unwrap()
            .unwrap();
        let missing = load_item_by_quick_paste_index(&db, &visible_items, 3).unwrap();

        assert_eq!(first.id, newest.id);
        assert_eq!(second.id, older.id);
        assert!(missing.is_none());
    }

    #[test]
    fn initialized_visible_items_use_snapshot_order_and_empty_is_authoritative() {
        let db = test_db();
        let visible_items = VisibleClipboardItems::default();
        let first = insert_text_at_time(&db, "first", 1_000);
        let second = insert_text_at_time(&db, "second", 2_000);

        visible_items.set(vec![first.id, second.id]).unwrap();
        let loaded = load_item_by_quick_paste_index(&db, &visible_items, 1)
            .unwrap()
            .unwrap();
        assert_eq!(loaded.id, first.id);

        visible_items.set(Vec::new()).unwrap();
        assert!(load_item_by_quick_paste_index(&db, &visible_items, 1)
            .unwrap()
            .is_none());
    }

    #[test]
    fn deleted_visible_id_does_not_fall_back_to_another_item() {
        let db = test_db();
        let visible_items = VisibleClipboardItems::default();
        let fallback = insert_text_at_time(&db, "fallback", 1_000);
        let deleted = insert_text_at_time(&db, "deleted", 2_000);
        visible_items.set(vec![deleted.id]).unwrap();
        database::clipboard::delete(&db, deleted.id).unwrap();

        let loaded = load_item_by_quick_paste_index(&db, &visible_items, 1).unwrap();

        assert!(loaded.is_none());
        assert!(database::clipboard::get_by_id(&db, fallback.id)
            .unwrap()
            .is_some());
    }

    #[test]
    fn plain_text_actions_reject_non_text_items() {
        let db = test_db();
        let item = insert_text_at_time(&db, "not-text", 1_000);
        let conn = db.get_connection().unwrap();
        conn.execute(
            "UPDATE clipboard_items SET content_type = 'image' WHERE id = ?1",
            [item.id],
        )
        .unwrap();
        drop(conn);

        let result = copy_item_as_plain_text_by_id(&db, item.id);

        assert!(matches!(result, Err(AppError::InvalidInput(message)) if message.contains("text")));
    }
}
