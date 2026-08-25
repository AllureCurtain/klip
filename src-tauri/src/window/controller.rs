use crate::config::registry;
use crate::database;
use crate::{AppError, WindowCloseDecision};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Read-only snapshot of the main window, served by `GET /api/window/status`.
/// Coordinates and sizes are physical pixels; the window controls are
/// unaffected by this snapshot.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStatus {
    pub exists: bool,
    pub visible: bool,
    pub minimized: bool,
    pub maximized: bool,
    pub focused: bool,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub fn main_window_status(app: &AppHandle) -> Result<WindowStatus, AppError> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(WindowStatus {
            exists: false,
            visible: false,
            minimized: false,
            maximized: false,
            focused: false,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });
    };
    let position = window
        .outer_position()
        .map_err(|error| AppError::Window(format!("failed to read window position: {error}")))?;
    let size = window
        .outer_size()
        .map_err(|error| AppError::Window(format!("failed to read window size: {error}")))?;
    Ok(WindowStatus {
        exists: true,
        visible: window.is_visible().unwrap_or(false),
        minimized: window.is_minimized().unwrap_or(false),
        maximized: window.is_maximized().unwrap_or(false),
        focused: window.is_focused().unwrap_or(false),
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

pub fn show_main_window_and_focus(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        crate::capture_previous_foreground();
        window.show().map_err(|e| AppError::Window(e.to_string()))?;
        window
            .set_focus()
            .map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn hide_main_window(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn toggle_main_window(app: &AppHandle) -> Result<(), AppError> {
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

pub fn show_main_window_and_emit(app: &AppHandle, event: &str) {
    if let Err(error) = show_main_window_and_focus(app) {
        tracing::error!("Failed to show main window: {}", error);
    }
    if let Err(error) = app.emit(event, ()) {
        tracing::error!("Failed to emit {}: {}", event, error);
    }
}

pub fn apply_configured_size(
    app: &AppHandle,
    db: &database::Database,
) -> Result<(u32, u32), AppError> {
    let (width, height) = configured_window_size(db)?;

    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
            .map_err(|e| AppError::Window(e.to_string()))?;
    }

    Ok((width, height))
}

pub fn configured_window_size(db: &database::Database) -> Result<(u32, u32), AppError> {
    let width = database::config::get(db, registry::KEY_WINDOW_WIDTH)?
        .and_then(|value| value.parse().ok())
        .map(crate::config::clamp_window_width)
        .unwrap_or(crate::config::DEFAULT_WINDOW_WIDTH);
    let height = database::config::get(db, registry::KEY_WINDOW_HEIGHT)?
        .and_then(|value| value.parse().ok())
        .map(crate::config::clamp_window_height)
        .unwrap_or(crate::config::DEFAULT_WINDOW_HEIGHT);
    Ok((width, height))
}

pub fn close_to_tray_enabled(db: &database::Database) -> Result<bool, AppError> {
    Ok(database::config::get(db, registry::KEY_CLOSE_TO_TRAY)?
        .map(|value| value == "true")
        .unwrap_or(true))
}

pub fn close_decision(close_to_tray: bool) -> WindowCloseDecision {
    if close_to_tray {
        WindowCloseDecision::HideToTray
    } else {
        WindowCloseDecision::Quit
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> database::Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = database::Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    #[test]
    fn close_to_tray_decision_remains_unchanged() {
        assert_eq!(close_decision(true), WindowCloseDecision::HideToTray);
        assert_eq!(close_decision(false), WindowCloseDecision::Quit);
    }

    #[test]
    fn configured_window_size_clamps_to_packaged_minimums() {
        let db = test_db();
        database::config::set(&db, registry::KEY_WINDOW_WIDTH, "300").unwrap();
        database::config::set(&db, registry::KEY_WINDOW_HEIGHT, "400").unwrap();

        let size = configured_window_size(&db).unwrap();

        assert_eq!(
            size,
            (
                crate::config::MIN_WINDOW_WIDTH,
                crate::config::MIN_WINDOW_HEIGHT
            )
        );
    }
}
