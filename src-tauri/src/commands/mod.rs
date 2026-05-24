mod productization;

pub use productization::*;

use crate::database::{self, ClipboardItem, DiagnosticsInfo, SystemInfo};
use crate::AppError;
use tauri::{Emitter, Manager, State};
#[cfg(not(target_os = "linux"))]
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_clipboard_list(
    db: State<'_, database::Database>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardItem>, AppError> {
    database::clipboard::get_list(&db, limit.unwrap_or(100), offset.unwrap_or(0))
}

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
pub fn get_clipboard_by_id(
    db: State<'_, database::Database>,
    id: i64,
) -> Result<Option<ClipboardItem>, AppError> {
    database::clipboard::get_by_id(&db, id)
}

#[tauri::command]
pub fn delete_clipboard_item(db: State<'_, database::Database>, id: i64) -> Result<(), AppError> {
    database::clipboard::delete(&db, id)
}

#[tauri::command]
pub fn toggle_favorite(
    db: State<'_, database::Database>,
    id: i64,
) -> Result<ClipboardItem, AppError> {
    database::clipboard::toggle_favorite(&db, id)
}

#[tauri::command]
pub fn clear_clipboard_history(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
) -> Result<(), AppError> {
    database::clipboard::clear(&db)?;
    let _ = app.emit("clipboard-cleared", ());
    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(db: State<'_, database::Database>, id: i64) -> Result<(), AppError> {
    let item = database::clipboard::get_by_id(&db, id)?
        .ok_or_else(|| AppError::NotFound(format!("clipboard item {} not found", id)))?;

    crate::clipboard::copy_to_clipboard(
        &item.content,
        &item.content_type,
        item.metadata.as_deref(),
    )?;
    let _ = database::clipboard::touch_last_used(&db, id);
    Ok(())
}

#[tauri::command]
pub fn paste_from_clipboard(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
) -> Result<(), AppError> {
    let item = database::clipboard::get_by_id(&db, id)?
        .ok_or_else(|| AppError::NotFound(format!("clipboard item {} not found", id)))?;

    crate::clipboard::copy_to_clipboard(
        &item.content,
        &item.content_type,
        item.metadata.as_deref(),
    )?;

    let _ = database::clipboard::touch_last_used(&db, id);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

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
        crate::platform::linux::simulate_paste()?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_config(
    db: State<'_, database::Database>,
    key: String,
) -> Result<Option<String>, AppError> {
    database::config::get(&db, &key)
}

#[tauri::command]
pub fn get_all_config(
    db: State<'_, database::Database>,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    database::config::get_all(&db)
}

#[tauri::command]
pub fn set_config(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    let previous_value = if key == "hotkey_toggle_window" || key == "hotkey_quick_paste_prefix" {
        crate::hotkey::manager::validate_config_value(&key, &value)?;
        database::config::get(&db, &key)?
    } else {
        None
    };

    database::config::set(&db, &key, &value)?;

    if key == "window_width" || key == "window_height" {
        apply_window_size_from_config(&app, &db)?;
    }

    if key == "hotkey_toggle_window" || key == "hotkey_quick_paste_prefix" {
        if let Err(err) = crate::hotkey::manager::reload_hotkeys(&app) {
            match previous_value {
                Some(previous) => {
                    let _ = database::config::set(&db, &key, &previous);
                }
                None => {
                    let fallback = match key.as_str() {
                        "hotkey_toggle_window" => crate::hotkey::manager::DEFAULT_TOGGLE_HOTKEY,
                        "hotkey_quick_paste_prefix" => {
                            crate::hotkey::manager::DEFAULT_QUICK_PASTE_PREFIX
                        }
                        _ => unreachable!(),
                    };
                    let _ = database::config::set(&db, &key, fallback);
                }
            }

            if let Some(previous) = database::config::get(&db, "hotkey_toggle_window")? {
                let quick_paste_prefix = database::config::get(&db, "hotkey_quick_paste_prefix")?
                    .unwrap_or_else(|| {
                        crate::hotkey::manager::DEFAULT_QUICK_PASTE_PREFIX.to_string()
                    });
                let _ = crate::hotkey::manager::reload_hotkeys_from_values(
                    &app,
                    &previous,
                    &quick_paste_prefix,
                );
            }

            return Err(AppError::Hotkey(format!(
                "Failed to reload hotkeys: {}",
                err
            )));
        }
    }

    let _ = app.emit(
        "config-changed",
        serde_json::json!({ "key": key, "value": value }),
    );
    Ok(())
}

fn apply_window_size_from_config(
    app: &tauri::AppHandle,
    db: &database::Database,
) -> Result<(), AppError> {
    let width: u32 = database::config::get(db, "window_width")?
        .and_then(|v| v.parse().ok())
        .unwrap_or(560);
    let height: u32 = database::config::get(db, "window_height")?
        .and_then(|v| v.parse().ok())
        .unwrap_or(760);

    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
            .map_err(|e| AppError::Window(e.to_string()))?;
    }

    Ok(())
}

#[tauri::command]
pub fn toggle_window(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| AppError::Window(e.to_string()))?;
        } else {
            crate::capture_previous_foreground();
            window.show().map_err(|e| AppError::Window(e.to_string()))?;
            window
                .set_focus()
                .map_err(|e| AppError::Window(e.to_string()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_window(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        crate::capture_previous_foreground();
        window.show().map_err(|e| AppError::Window(e.to_string()))?;
        window
            .set_focus()
            .map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_auto_start(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    enabled: bool,
) -> Result<(), AppError> {
    #[cfg(target_os = "linux")]
    {
        let exe = std::env::current_exe()
            .map_err(|e| AppError::System(format!("Failed to resolve current exe: {}", e)))?;
        crate::platform::linux::set_autostart(enabled, &exe)?;
        database::config::set(&db, "auto_start", if enabled { "true" } else { "false" })?;
        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": "auto_start", "value": enabled.to_string() }),
        );
        Ok(())
    }

    #[cfg(not(target_os = "linux"))]
    {
        let manager = app.autolaunch();

        if enabled {
            manager.enable().map_err(|e| {
                tracing::error!("Failed to enable autostart: {}", e);
                AppError::System(format!("Failed to enable autostart: {}", e))
            })?;
            database::config::set(&db, "auto_start", "true")?;
            tracing::info!("Auto start enabled");
        } else {
            manager.disable().map_err(|e| {
                tracing::warn!("Failed to disable autostart: {}", e);
                AppError::System(format!("Failed to disable autostart: {}", e))
            })?;
            database::config::set(&db, "auto_start", "false")?;
            tracing::info!("Auto start disabled");
        }

        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": "auto_start", "value": enabled.to_string() }),
        );
        Ok(())
    }
}

#[tauri::command]
pub fn is_auto_start_enabled(app: tauri::AppHandle) -> Result<bool, AppError> {
    #[cfg(target_os = "linux")]
    {
        let _ = app;
        crate::platform::linux::is_autostart_enabled()
    }

    #[cfg(not(target_os = "linux"))]
    {
        let manager = app.autolaunch();
        manager.is_enabled().map_err(|e| {
            tracing::warn!("Failed to query autostart state: {}", e);
            AppError::System(e.to_string())
        })
    }
}

#[tauri::command]
pub fn get_system_info() -> Result<SystemInfo, AppError> {
    Ok(SystemInfo {
        platform: platform_name().to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn get_diagnostics_info(app: tauri::AppHandle) -> Result<DiagnosticsInfo, AppError> {
    #[cfg(target_os = "linux")]
    let data_dir = crate::platform::linux::data_dir();

    #[cfg(not(target_os = "linux"))]
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::System(format!("Failed to resolve app data dir: {}", e)))?;

    #[cfg(target_os = "linux")]
    let _ = app;

    let paths = build_diagnostics_paths(&data_dir);

    Ok(DiagnosticsInfo {
        platform: platform_name().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: paths.data_dir.to_string_lossy().to_string(),
        db_path: paths.db_path.to_string_lossy().to_string(),
        log_dir: paths.log_dir.to_string_lossy().to_string(),
    })
}

struct DiagnosticsPaths {
    data_dir: std::path::PathBuf,
    db_path: std::path::PathBuf,
    log_dir: std::path::PathBuf,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn build_diagnostics_paths(data_dir: &std::path::Path) -> DiagnosticsPaths {
    #[cfg(target_os = "linux")]
    let log_dir = crate::platform::linux::log_dir();

    #[cfg(not(target_os = "linux"))]
    let log_dir = data_dir.join("logs");

    DiagnosticsPaths {
        data_dir: data_dir.to_path_buf(),
        db_path: data_dir.join("klip.db"),
        log_dir,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostics_paths_are_derived_from_app_data_dir() {
        let base = std::path::PathBuf::from(r"C:\Users\tester\AppData\Roaming\com.klip.app");
        let paths = build_diagnostics_paths(&base);

        assert!(paths.db_path.ends_with(std::path::Path::new("klip.db")));
        assert!(paths.log_dir.ends_with(std::path::Path::new("logs")));
    }

    #[test]
    fn platform_name_is_supported_or_unknown() {
        assert!(matches!(
            platform_name(),
            "windows" | "macos" | "linux" | "unknown"
        ));
    }
}
