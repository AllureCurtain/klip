use crate::database::{
    self, BackupSummary, ClipboardItem, ImportSummary, RestoreSummary, Snippet, SnippetInput,
    SourceRule, SourceRuleInput, Tag,
};
use crate::AppError;
use tauri::State;
use tauri::{Emitter, Manager};

#[tauri::command]
pub fn begin_focus_loss_suppression() {
    crate::window::controller::begin_focus_loss_suppression();
}

#[tauri::command]
pub fn end_focus_loss_suppression() {
    crate::window::controller::end_focus_loss_suppression();
}

#[tauri::command]
pub fn get_shortcut_bindings(
    db: State<'_, database::Database>,
) -> Result<Vec<database::ShortcutBinding>, AppError> {
    database::productization::list_shortcut_bindings(&db)
}

#[tauri::command]
pub fn set_shortcut_bindings(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    bindings: Vec<database::ShortcutBinding>,
) -> Result<(), AppError> {
    crate::hotkey::manager::validate_bindings_for_command(&bindings)?;
    let old = database::productization::list_shortcut_bindings(&db)?;
    crate::hotkey::manager::apply_bindings(&app, &bindings)?;
    if let Err(error) = database::productization::replace_shortcut_bindings(&db, &bindings) {
        let _ = crate::hotkey::manager::apply_bindings(&app, &old);
        return Err(AppError::Database(format!(
            "failed to persist shortcut bindings: {}",
            error
        )));
    }
    let _ = app.emit("shortcut-registration-changed", &bindings);
    Ok(())
}

#[tauri::command]
pub fn get_window_state(
    db: State<'_, database::Database>,
    window_label: Option<String>,
) -> Result<Option<database::WindowState>, AppError> {
    database::productization::get_window_state(&db, window_label.as_deref().unwrap_or("main"))
}

#[tauri::command]
pub fn reset_window_state(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    window_label: Option<String>,
) -> Result<database::WindowState, AppError> {
    let label = window_label.unwrap_or_else(|| "main".into());
    crate::window::controller::reset_window_state(&app, &db, &label)
}

#[tauri::command]
pub fn get_storage_usage(
    db: State<'_, database::Database>,
) -> Result<database::StorageUsage, AppError> {
    database::productization::storage_usage(&db)
}

#[tauri::command]
pub fn get_image_representation(
    db: State<'_, database::Database>,
    item_id: i64,
    format: Option<String>,
) -> Result<Vec<u8>, AppError> {
    database::productization::get_image_representation(&db, item_id, format.as_deref())
}

#[tauri::command]
pub fn get_image_thumbnail(
    db: State<'_, database::Database>,
    item_id: i64,
) -> Result<Vec<u8>, AppError> {
    database::productization::get_image_thumbnail(&db, item_id)
}

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
