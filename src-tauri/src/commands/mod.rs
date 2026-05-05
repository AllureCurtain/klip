use crate::database::{self, ClipboardItem, SystemInfo};
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

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
    content_type: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    database::clipboard::search(&db, &query, content_type.as_deref(), limit.unwrap_or(100))
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
pub fn toggle_favorite(db: State<'_, database::Database>, id: i64) -> Result<ClipboardItem, String> {
    database::clipboard::toggle_favorite(&db, id)
}

#[tauri::command]
pub fn clear_clipboard_history(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
) -> Result<(), String> {
    database::clipboard::clear(&db)?;
    let _ = app.emit("clipboard-cleared", ());
    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(db: State<'_, database::Database>, id: i64) -> Result<(), String> {
    let item = database::clipboard::get_by_id(&db, id)?.ok_or("Item not found")?;

    crate::clipboard::copy_to_clipboard(&item.content, &item.content_type, item.metadata.as_deref())?;
    let _ = database::clipboard::touch_last_used(&db, id);
    Ok(())
}

#[tauri::command]
pub fn paste_from_clipboard(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
) -> Result<(), String> {
    let item = database::clipboard::get_by_id(&db, id)?.ok_or("Item not found")?;

    crate::clipboard::copy_to_clipboard(
        &item.content,
        &item.content_type,
        item.metadata.as_deref(),
    )?;

    // Bump last_used_at so this item floats to the top on next list refresh.
    let _ = database::clipboard::touch_last_used(&db, id);

    // Hide the Klip window
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    // Restore focus to the window that was foreground BEFORE Klip opened.
    // Without this, Ctrl+V is sent to whatever window the OS picked after
    // hide() — often the desktop on Win11 — and file paste silently fails.
    #[cfg(target_os = "windows")]
    {
        // Tiny pause for hide() to start propagating, then restore foreground.
        std::thread::sleep(std::time::Duration::from_millis(30));
        let _ = crate::restore_previous_foreground();
        // Give the target window time to accept focus before sending Ctrl+V.
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
            use enigo::Keyboard;
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
            let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
            use enigo::Keyboard;
            let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Press);
            let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Release);
        }
    }

    #[cfg(target_os = "linux")]
    {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Ok(mut enigo) = enigo::Enigo::new(&enigo::Settings::default()) {
            use enigo::Keyboard;
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
            let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
        }
    }

    Ok(())
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
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    key: String,
    value: String,
) -> Result<(), String> {
    database::config::set(&db, &key, &value)?;
    let _ = app.emit("config-changed", serde_json::json!({ "key": key, "value": value }));
    Ok(())
}

#[tauri::command]
pub fn toggle_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            // Capture the foreground window BEFORE we steal focus.
            crate::capture_previous_foreground();
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        crate::capture_previous_foreground();
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
pub fn set_auto_start(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    enabled: bool,
) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())?;
    } else {
        manager.disable().map_err(|e| e.to_string())?;
    }

    // Persist user choice so we can re-sync on next launch.
    database::config::set(&db, "auto_start", if enabled { "true" } else { "false" })?;

    tracing::info!("Auto start set to: {}", enabled);
    Ok(())
}

#[tauri::command]
pub fn is_auto_start_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
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
