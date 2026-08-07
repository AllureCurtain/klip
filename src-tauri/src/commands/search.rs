use crate::database::{self, AdvancedSearchQuery, ClipboardItem};
use crate::AppError;
use tauri::State;

#[tauri::command]
pub fn search_clipboard(
    db: State<'_, database::Database>,
    query: String,
    content_type: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, AppError> {
    database::clipboard::search(&db, &query, content_type.as_deref(), limit.unwrap_or(100))
}

#[tauri::command]
pub fn search_clipboard_filtered(
    db: State<'_, database::Database>,
    query: String,
    content_type: Option<String>,
    favorite_only: Option<bool>,
    tag_id: Option<i64>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardItem>, AppError> {
    database::productization::search_filtered(
        &db,
        &query,
        content_type.as_deref(),
        favorite_only.unwrap_or(false),
        tag_id,
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    )
}

#[tauri::command]
pub fn search_clipboard_advanced(
    db: State<'_, database::Database>,
    query: AdvancedSearchQuery,
) -> Result<Vec<ClipboardItem>, AppError> {
    database::productization::search_advanced(&db, query)
}
