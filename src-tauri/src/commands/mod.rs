mod productization;
mod search;

pub use productization::*;
pub use search::*;

use crate::config::registry::{self, RuntimeEffect};
use crate::database::{self, ClipboardItem, DiagnosticsInfo, SystemInfo};
use crate::AppError;
use serde::Deserialize;
use tauri::{Emitter, State};
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
pub fn update_clipboard_annotations(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
    input: database::ClipboardAnnotationInput,
) -> Result<ClipboardItem, AppError> {
    let updated = database::clipboard::update_annotations(&db, id, input.custom_title, input.note)?;
    let _ = app.emit("clipboard-item-updated", &updated);
    Ok(updated)
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
    crate::clipboard::paste::copy_item_by_id(&db, id)
}

#[tauri::command]
pub fn copy_plain_text_to_clipboard(
    db: State<'_, database::Database>,
    id: i64,
) -> Result<(), AppError> {
    crate::clipboard::paste::copy_item_as_plain_text_by_id(&db, id)
}

#[tauri::command]
pub fn paste_from_clipboard(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
) -> Result<(), AppError> {
    crate::clipboard::paste::paste_item_by_id(&app, &db, id)
}

#[tauri::command]
pub fn paste_plain_text_from_clipboard(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
) -> Result<(), AppError> {
    crate::clipboard::paste::paste_item_as_plain_text_by_id(&app, &db, id)
}

#[tauri::command]
pub fn set_visible_clipboard_items(
    visible_items: State<'_, crate::hotkey::VisibleClipboardItems>,
    ids: Vec<i64>,
) -> Result<(), AppError> {
    visible_items.set(ids)
}

#[tauri::command]
pub fn get_clipboard_content_actions(
    db: State<'_, database::Database>,
    id: i64,
) -> Result<Vec<crate::clipboard::actions::ClipboardContentAction>, AppError> {
    crate::clipboard::actions::get_actions_by_id(&db, id)
}

#[tauri::command]
pub fn execute_clipboard_content_action(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    id: i64,
    action: crate::clipboard::actions::ClipboardContentAction,
) -> Result<(), AppError> {
    crate::clipboard::actions::execute_action_by_id(&app, &db, id, action)
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
    let descriptor = registry::require_descriptor(&key)?;
    let value = descriptor.normalize(&value)?;
    let previous_value = if descriptor.effect == RuntimeEffect::HotkeyReload {
        database::config::get(&db, &key)?
    } else {
        None
    };

    database::config::set(&db, &key, &value)?;

    match descriptor.effect {
        RuntimeEffect::WindowSize => apply_window_size_from_config(&app, &db)?,
        RuntimeEffect::HotkeyReload => {
            if let Err(err) = crate::hotkey::manager::reload_hotkeys(&app) {
                rollback_hotkey_config(&app, &db, descriptor, previous_value)?;
                return Err(AppError::Hotkey(format!(
                    "Failed to reload hotkeys: {}",
                    err
                )));
            }
        }
        RuntimeEffect::None => {}
    }

    let _ = app.emit(
        "config-changed",
        serde_json::json!({ "key": key, "value": value }),
    );
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ConfigUpdate {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub fn set_config_many(
    app: tauri::AppHandle,
    db: State<'_, database::Database>,
    entries: Vec<ConfigUpdate>,
) -> Result<(), AppError> {
    let normalized = normalize_config_updates(entries)?;
    let previous_hotkeys = previous_hotkey_values(&db, &normalized)?;
    let has_window_size_effect = normalized
        .iter()
        .any(|(descriptor, _)| descriptor.effect == RuntimeEffect::WindowSize);
    let has_hotkey_effect = normalized
        .iter()
        .any(|(descriptor, _)| descriptor.effect == RuntimeEffect::HotkeyReload);
    let persisted_entries = normalized
        .iter()
        .map(|(descriptor, value)| (descriptor.key.to_string(), value.clone()))
        .collect::<Vec<_>>();

    database::config::set_many(&db, &persisted_entries)?;

    if has_window_size_effect {
        apply_window_size_from_config(&app, &db)?;
    }

    if has_hotkey_effect {
        if let Err(err) = crate::hotkey::manager::reload_hotkeys(&app) {
            rollback_hotkey_values(&app, &db, previous_hotkeys)?;
            return Err(AppError::Hotkey(format!(
                "Failed to reload hotkeys: {}",
                err
            )));
        }
    }

    for (key, value) in persisted_entries {
        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": key, "value": value }),
        );
    }

    Ok(())
}

#[cfg(test)]
fn normalize_config_value(key: &str, value: String) -> Result<String, AppError> {
    registry::require_descriptor(key)?.normalize(&value)
}

fn normalize_config_updates(
    entries: Vec<ConfigUpdate>,
) -> Result<Vec<(&'static registry::ConfigDescriptor, String)>, AppError> {
    entries
        .into_iter()
        .map(|entry| {
            let descriptor = registry::require_descriptor(&entry.key)?;
            let value = descriptor.normalize(&entry.value)?;
            Ok((descriptor, value))
        })
        .collect()
}

fn previous_hotkey_values(
    db: &database::Database,
    normalized: &[(&'static registry::ConfigDescriptor, String)],
) -> Result<Vec<(&'static registry::ConfigDescriptor, Option<String>)>, AppError> {
    normalized
        .iter()
        .filter(|(descriptor, _)| descriptor.effect == RuntimeEffect::HotkeyReload)
        .map(|(descriptor, _)| {
            database::config::get(db, descriptor.key).map(|value| (*descriptor, value))
        })
        .collect()
}

fn apply_window_size_from_config(
    app: &tauri::AppHandle,
    db: &database::Database,
) -> Result<(), AppError> {
    crate::window::controller::apply_configured_size(app, db).map(|_| ())
}

fn rollback_hotkey_config(
    app: &tauri::AppHandle,
    db: &database::Database,
    descriptor: &registry::ConfigDescriptor,
    previous_value: Option<String>,
) -> Result<(), AppError> {
    let rollback_value = previous_value.unwrap_or_else(|| descriptor.default_value.to_string());
    let _ = database::config::set(db, descriptor.key, &rollback_value);

    let toggle = database::config::get(db, registry::KEY_HOTKEY_TOGGLE_WINDOW)?
        .unwrap_or_else(|| registry::DEFAULT_TOGGLE_HOTKEY.to_string());
    let quick_paste_prefix = database::config::get(db, registry::KEY_HOTKEY_QUICK_PASTE_PREFIX)?
        .unwrap_or_else(|| registry::DEFAULT_QUICK_PASTE_PREFIX.to_string());
    let _ = crate::hotkey::manager::reload_hotkeys_from_values(app, &toggle, &quick_paste_prefix);
    Ok(())
}

fn rollback_hotkey_values(
    app: &tauri::AppHandle,
    db: &database::Database,
    previous_values: Vec<(&'static registry::ConfigDescriptor, Option<String>)>,
) -> Result<(), AppError> {
    for (descriptor, previous_value) in previous_values {
        let rollback_value = previous_value.unwrap_or_else(|| descriptor.default_value.to_string());
        let _ = database::config::set(db, descriptor.key, &rollback_value);
    }

    let toggle = database::config::get(db, registry::KEY_HOTKEY_TOGGLE_WINDOW)?
        .unwrap_or_else(|| registry::DEFAULT_TOGGLE_HOTKEY.to_string());
    let quick_paste_prefix = database::config::get(db, registry::KEY_HOTKEY_QUICK_PASTE_PREFIX)?
        .unwrap_or_else(|| registry::DEFAULT_QUICK_PASTE_PREFIX.to_string());
    let _ = crate::hotkey::manager::reload_hotkeys_from_values(app, &toggle, &quick_paste_prefix);
    Ok(())
}

#[tauri::command]
pub fn toggle_window(app: tauri::AppHandle) -> Result<(), AppError> {
    crate::window::controller::toggle_main_window(&app)
}

#[tauri::command]
pub fn show_window(app: tauri::AppHandle) -> Result<(), AppError> {
    crate::window::controller::show_main_window_and_focus(&app)
}

#[tauri::command]
pub fn hide_window(app: tauri::AppHandle) -> Result<(), AppError> {
    crate::window::controller::hide_main_window(&app)
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
        database::config::set(
            &db,
            registry::KEY_AUTO_START,
            if enabled { "true" } else { "false" },
        )?;
        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": registry::KEY_AUTO_START, "value": enabled.to_string() }),
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
            database::config::set(&db, registry::KEY_AUTO_START, "true")?;
            tracing::info!("Auto start enabled");
        } else {
            manager.disable().map_err(|e| {
                tracing::warn!("Failed to disable autostart: {}", e);
                AppError::System(format!("Failed to disable autostart: {}", e))
            })?;
            database::config::set(&db, registry::KEY_AUTO_START, "false")?;
            tracing::info!("Auto start disabled");
        }

        let _ = app.emit(
            "config-changed",
            serde_json::json!({ "key": registry::KEY_AUTO_START, "value": enabled.to_string() }),
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
        version: system_version(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
pub fn get_diagnostics_info(app: tauri::AppHandle) -> Result<DiagnosticsInfo, AppError> {
    let data_dir = database::app_data_dir(&app)?;
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

fn system_version() -> String {
    platform_system_version().unwrap_or_else(|| platform_name().to_string())
}

#[cfg(target_os = "windows")]
fn platform_system_version() -> Option<String> {
    std::process::Command::new("cmd")
        .args(["/C", "ver"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "macos")]
fn platform_system_version() -> Option<String> {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| format!("macOS {}", value.trim()))
        .filter(|value| value.trim() != "macOS")
}

#[cfg(target_os = "linux")]
fn platform_system_version() -> Option<String> {
    std::fs::read_to_string("/etc/os-release")
        .ok()
        .and_then(|content| {
            content
                .lines()
                .find_map(|line| line.strip_prefix("PRETTY_NAME="))
                .map(|value| value.trim_matches('"').to_string())
        })
        .filter(|value| !value.is_empty())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn platform_system_version() -> Option<String> {
    None
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

    #[test]
    fn system_info_reports_os_version_separately_from_app_version() {
        let info = get_system_info().unwrap();

        assert!(!info.version.trim().is_empty());
        assert_ne!(info.version, info.app_version);
    }

    #[test]
    fn normalizes_window_size_config_to_packaged_minimums() {
        assert_eq!(
            normalize_config_value(registry::KEY_WINDOW_WIDTH, "300".to_string()).unwrap(),
            "360"
        );
        assert_eq!(
            normalize_config_value(registry::KEY_WINDOW_HEIGHT, "400".to_string()).unwrap(),
            "480"
        );
        assert_eq!(
            normalize_config_value(registry::KEY_WINDOW_WIDTH, "640".to_string()).unwrap(),
            "640"
        );
    }
}
