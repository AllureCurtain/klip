use crate::database::{
    self, AdvancedSearchQuery, BackupSummary, ClipboardItem, ImportSummary, RestoreSummary,
    Snippet, SnippetInput, SourceRule, SourceRuleInput, Tag,
};
use crate::AppError;
use tauri::Manager;
use tauri::State;

#[tauri::command]
pub fn get_clipboard_list_filtered(
    db: State<'_, database::Database>,
    limit: Option<i64>,
    offset: Option<i64>,
    content_type: Option<String>,
    favorite_only: Option<bool>,
    tag_id: Option<i64>,
) -> Result<Vec<ClipboardItem>, AppError> {
    database::productization::get_list_filtered(
        &db,
        limit.unwrap_or(100),
        offset.unwrap_or(0),
        content_type.as_deref(),
        favorite_only.unwrap_or(false),
        tag_id,
    )
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

#[tauri::command]
pub fn delete_clipboard_items(
    db: State<'_, database::Database>,
    ids: Vec<i64>,
) -> Result<usize, AppError> {
    database::productization::batch_delete(&db, &ids)
}

#[tauri::command]
pub fn set_favorite_for_items(
    db: State<'_, database::Database>,
    ids: Vec<i64>,
    is_favorited: bool,
) -> Result<usize, AppError> {
    database::productization::batch_set_favorite(&db, &ids, is_favorited)
}

#[tauri::command]
pub fn list_tags(db: State<'_, database::Database>) -> Result<Vec<Tag>, AppError> {
    database::productization::list_tags(&db)
}

#[tauri::command]
pub fn create_tag(
    db: State<'_, database::Database>,
    name: String,
    color: Option<String>,
) -> Result<Tag, AppError> {
    database::productization::create_tag(&db, &name, color.as_deref())
}

#[tauri::command]
pub fn delete_tag(db: State<'_, database::Database>, id: i64) -> Result<(), AppError> {
    database::productization::delete_tag(&db, id)
}

#[tauri::command]
pub fn assign_tag_to_item(
    db: State<'_, database::Database>,
    item_id: i64,
    tag_id: i64,
) -> Result<(), AppError> {
    database::productization::assign_tag(&db, item_id, tag_id)
}

#[tauri::command]
pub fn remove_tag_from_item(
    db: State<'_, database::Database>,
    item_id: i64,
    tag_id: i64,
) -> Result<(), AppError> {
    database::productization::remove_tag(&db, item_id, tag_id)
}

#[tauri::command]
pub fn list_snippets(db: State<'_, database::Database>) -> Result<Vec<Snippet>, AppError> {
    database::snippets::list(&db)
}

#[tauri::command]
pub fn search_snippets(
    db: State<'_, database::Database>,
    query: String,
) -> Result<Vec<Snippet>, AppError> {
    database::snippets::search(&db, &query)
}

#[tauri::command]
pub fn create_snippet(
    db: State<'_, database::Database>,
    input: SnippetInput,
) -> Result<Snippet, AppError> {
    database::snippets::create(&db, input)
}

#[tauri::command]
pub fn update_snippet(
    db: State<'_, database::Database>,
    id: i64,
    input: SnippetInput,
) -> Result<Snippet, AppError> {
    database::snippets::update(&db, id, input)
}

#[tauri::command]
pub fn delete_snippet(db: State<'_, database::Database>, id: i64) -> Result<(), AppError> {
    database::snippets::delete(&db, id)
}

#[tauri::command]
pub fn list_source_rules(db: State<'_, database::Database>) -> Result<Vec<SourceRule>, AppError> {
    database::productization::list_source_rules(&db)
}

#[tauri::command]
pub fn create_source_rule(
    db: State<'_, database::Database>,
    input: SourceRuleInput,
) -> Result<SourceRule, AppError> {
    database::productization::create_source_rule(&db, input)
}

#[tauri::command]
pub fn update_source_rule(
    db: State<'_, database::Database>,
    id: i64,
    input: SourceRuleInput,
) -> Result<SourceRule, AppError> {
    database::productization::update_source_rule(&db, id, input)
}

#[tauri::command]
pub fn set_source_rule_enabled(
    db: State<'_, database::Database>,
    id: i64,
    enabled: bool,
) -> Result<SourceRule, AppError> {
    database::productization::set_source_rule_enabled(&db, id, enabled)
}

#[tauri::command]
pub fn delete_source_rule(db: State<'_, database::Database>, id: i64) -> Result<(), AppError> {
    database::productization::delete_source_rule(&db, id)
}

#[tauri::command]
pub fn rescan_sensitive_items(db: State<'_, database::Database>) -> Result<usize, AppError> {
    database::productization::rescan_sensitive(&db)
}

#[tauri::command]
pub fn export_clipboard_json(
    db: State<'_, database::Database>,
    path: String,
) -> Result<BackupSummary, AppError> {
    database::data_portability::export_json(&db, &path)
}

#[tauri::command]
pub fn export_clipboard_csv(
    db: State<'_, database::Database>,
    path: String,
) -> Result<BackupSummary, AppError> {
    database::data_portability::export_csv(&db, &path)
}

#[tauri::command]
pub fn import_clipboard_json(
    db: State<'_, database::Database>,
    path: String,
) -> Result<ImportSummary, AppError> {
    database::data_portability::import_json(&db, &path)
}

#[tauri::command]
pub fn import_clipboard_csv(
    db: State<'_, database::Database>,
    path: String,
) -> Result<ImportSummary, AppError> {
    database::data_portability::import_csv(&db, &path)
}

#[tauri::command]
pub fn backup_database(app: tauri::AppHandle, path: String) -> Result<BackupSummary, AppError> {
    let db = app.state::<database::Database>();
    database::data_portability::backup_database(&db, &path)
}

#[tauri::command]
pub fn restore_database(app: tauri::AppHandle, path: String) -> Result<RestoreSummary, AppError> {
    let db = app.state::<database::Database>();
    let db_path = database::get_db_path(&app)?;
    database::data_portability::restore_database(&db, &db_path, &path)
}
