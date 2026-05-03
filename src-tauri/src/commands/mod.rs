use crate::database::{self, ClipboardItem, SystemInfo};
use tauri::{Manager, State};

#[tauri::command]
pub fn get_clipboard_list(
    db: State<'_, database::Database>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    database::clipboard::get_list(&db, limit.unwrap_or(100), offset.unwrap_or(0))
}

#[tauri::command]
pub fn search_clipboard(
    db: State<'_, database::Database>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    database::clipboard::search(&db, &query, limit.unwrap_or(100))
}

#[tauri::command]
pub fn get_clipboard_by_id(
    db: State<'_, database::Database>,
    id: i64,
) -> Result<Option<ClipboardItem>, String> {
    database::clipboard::get_by_id(&db, id)
}

#[tauri::command]
pub fn delete_clipboard_item(db: State<'_, database::Database>, id: i64) -> Result<(), String> {
    database::clipboard::delete(&db, id)
}

#[tauri::command]
pub fn clear_clipboard_history(db: State<'_, database::Database>) -> Result<(), String> {
    database::clipboard::clear(&db)
}

#[tauri::command]
pub fn copy_to_clipboard(db: State<'_, database::Database>, id: i64) -> Result<(), String> {
    let item = database::clipboard::get_by_id(&db, id)?.ok_or("Item not found")?;

    crate::clipboard::copy_to_clipboard(&item.content)
}

#[tauri::command]
pub fn get_config(
    db: State<'_, database::Database>,
    key: String,
) -> Result<Option<String>, String> {
    database::config::get(&db, &key)
}

#[tauri::command]
pub fn get_all_config(
    db: State<'_, database::Database>,
) -> Result<std::collections::HashMap<String, String>, String> {
    database::config::get_all(&db)
}

#[tauri::command]
pub fn set_config(
    db: State<'_, database::Database>,
    key: String,
    value: String,
) -> Result<(), String> {
    database::config::set(&db, &key, &value)
}

#[tauri::command]
pub fn toggle_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_auto_start(enabled: bool) -> Result<(), String> {
    // 使用 tauri-plugin-autostart
    // 这个功能需要在 setup 中配置
    tracing::info!("Auto start set to: {}", enabled);
    Ok(())
}

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, String> {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    };

    Ok(SystemInfo {
        platform: platform.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
