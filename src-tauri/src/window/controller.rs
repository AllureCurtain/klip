use crate::config::registry;
use crate::database;
use crate::{AppError, WindowCloseDecision};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter, Manager, Monitor};

static FOCUS_LOSS_SUPPRESSION_COUNT: AtomicUsize = AtomicUsize::new(0);

#[derive(Debug, Clone, PartialEq)]
struct MonitorArea {
    id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[derive(Debug, Clone, PartialEq)]
struct WindowPlacement {
    x: i32,
    y: i32,
    width_dip: i64,
    height_dip: i64,
    monitor_id: String,
    scale_factor: f64,
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

pub fn begin_focus_loss_suppression() {
    FOCUS_LOSS_SUPPRESSION_COUNT.fetch_add(1, Ordering::AcqRel);
}

pub fn end_focus_loss_suppression() {
    let _ =
        FOCUS_LOSS_SUPPRESSION_COUNT.fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
            count.checked_sub(1)
        });
}

pub fn is_focus_loss_suppressed() -> bool {
    FOCUS_LOSS_SUPPRESSION_COUNT.load(Ordering::Acquire) > 0
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
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: width as f64,
                height: height as f64,
            }))
            .map_err(|e| AppError::Window(e.to_string()))?;
    }

    Ok((width, height))
}

pub fn apply_saved_window_state(app: &AppHandle, db: &database::Database) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let monitors = window
            .available_monitors()
            .map_err(|error| AppError::Window(error.to_string()))?;
        let monitor_areas = monitors.iter().map(monitor_area).collect::<Vec<_>>();
        let active_monitor_id = active_monitor(&window, &monitors)
            .map(|monitor| monitor_id(&monitor))
            .or_else(|| monitor_areas.first().map(|monitor| monitor.id.clone()));
        let state = database::productization::get_window_state(db, "main")?.unwrap_or(
            database::WindowState {
                window_label: "main".into(),
                width_dip: crate::config::DEFAULT_WINDOW_WIDTH as i64,
                height_dip: crate::config::DEFAULT_WINDOW_HEIGHT as i64,
                x: None,
                y: None,
                monitor_id: None,
                scale_factor: None,
                updated_at: crate::now_millis() as i64,
            },
        );
        let placement = resolve_placement(&state, &monitor_areas, active_monitor_id.as_deref())
            .ok_or_else(|| AppError::Window("no monitor is available for window restore".into()))?;
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize {
                width: placement.width_dip as f64,
                height: placement.height_dip as f64,
            }))
            .map_err(|e| AppError::Window(e.to_string()))?;
        window
            .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: placement.x,
                y: placement.y,
            }))
            .map_err(|e| AppError::Window(e.to_string()))?;
        let always_on_top = database::config::get(db, registry::KEY_ALWAYS_ON_TOP)?
            .map(|value| value == "true")
            .unwrap_or(true);
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| AppError::Window(e.to_string()))?;
        database::productization::save_window_state(
            db,
            &database::WindowState {
                window_label: "main".into(),
                width_dip: placement.width_dip,
                height_dip: placement.height_dip,
                x: Some(placement.x as i64),
                y: Some(placement.y as i64),
                monitor_id: Some(placement.monitor_id),
                scale_factor: Some(placement.scale_factor),
                updated_at: crate::now_millis() as i64,
            },
        )?;
    }
    Ok(())
}

pub fn reset_window_state(
    app: &AppHandle,
    db: &database::Database,
    label: &str,
) -> Result<database::WindowState, AppError> {
    let state = database::WindowState {
        window_label: label.to_string(),
        width_dip: crate::config::DEFAULT_WINDOW_WIDTH as i64,
        height_dip: crate::config::DEFAULT_WINDOW_HEIGHT as i64,
        x: None,
        y: None,
        monitor_id: None,
        scale_factor: None,
        updated_at: crate::now_millis() as i64,
    };
    database::productization::save_window_state(db, &state)?;
    apply_saved_window_state(app, db)?;
    database::productization::get_window_state(db, label)?.ok_or_else(|| {
        AppError::Database(format!("window state {label} was not saved after reset"))
    })
}

pub fn apply_always_on_top(app: &AppHandle, db: &database::Database) -> Result<(), AppError> {
    let enabled = database::config::get(db, registry::KEY_ALWAYS_ON_TOP)?
        .map(|value| value == "true")
        .unwrap_or(true);
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(enabled)
            .map_err(|error| AppError::Window(error.to_string()))?;
    }
    Ok(())
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

pub fn hide_on_focus_loss_enabled(db: &database::Database) -> Result<bool, AppError> {
    Ok(database::config::get(db, registry::KEY_HIDE_ON_FOCUS_LOSS)?
        .map(|value| value == "true")
        .unwrap_or(true))
}

pub fn persist_current_window_state(
    window: &tauri::WebviewWindow,
    db: &database::Database,
) -> Result<database::WindowState, AppError> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window
        .inner_size()
        .map_err(|e| AppError::Window(e.to_string()))?;
    let position = window
        .outer_position()
        .map_err(|e| AppError::Window(e.to_string()))?;
    let state = database::WindowState {
        window_label: window.label().to_string(),
        width_dip: (size.width as f64 / scale).round() as i64,
        height_dip: (size.height as f64 / scale).round() as i64,
        x: Some(position.x as i64),
        y: Some(position.y as i64),
        monitor_id: window
            .current_monitor()
            .ok()
            .flatten()
            .map(|monitor| monitor_id(&monitor)),
        scale_factor: Some(scale),
        updated_at: crate::now_millis() as i64,
    };
    database::productization::save_window_state(db, &state)?;
    Ok(state)
}

fn monitor_area(monitor: &Monitor) -> MonitorArea {
    let work_area = monitor.work_area();
    MonitorArea {
        id: monitor_id(monitor),
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width,
        height: work_area.size.height,
        scale_factor: monitor.scale_factor(),
    }
}

fn monitor_id(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| {
        format!(
            "monitor@{},{}:{}x{}",
            monitor.position().x,
            monitor.position().y,
            monitor.size().width,
            monitor.size().height
        )
    })
}

fn active_monitor(window: &tauri::WebviewWindow, monitors: &[Monitor]) -> Option<Monitor> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowRect};
        let mut rect = windows::Win32::Foundation::RECT::default();
        let foreground = unsafe { GetForegroundWindow() };
        if !foreground.is_invalid() && unsafe { GetWindowRect(foreground, &mut rect) }.is_ok() {
            let center_x = rect
                .left
                .saturating_add(rect.right.saturating_sub(rect.left) / 2);
            let center_y = rect
                .top
                .saturating_add(rect.bottom.saturating_sub(rect.top) / 2);
            if let Some(monitor) = monitors.iter().find(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                center_x >= position.x
                    && center_x < position.x.saturating_add(size.width as i32)
                    && center_y >= position.y
                    && center_y < position.y.saturating_add(size.height as i32)
            }) {
                return Some(monitor.clone());
            }
        }
    }
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned())
}

fn resolve_placement(
    state: &database::WindowState,
    monitors: &[MonitorArea],
    active_monitor_id: Option<&str>,
) -> Option<WindowPlacement> {
    let active = active_monitor_id
        .and_then(|id| monitors.iter().find(|monitor| monitor.id == id))
        .or_else(|| monitors.first())?;
    let saved = state
        .monitor_id
        .as_deref()
        .and_then(|id| monitors.iter().find(|monitor| monitor.id == id));
    let saved_position_is_usable = saved.is_some_and(|target| {
        let (width_dip, height_dip) = constrained_size(state, target);
        let width_px = (width_dip as f64 * target.scale_factor).round() as i32;
        let height_px = (height_dip as f64 * target.scale_factor).round() as i32;
        state.x.zip(state.y).is_some_and(|(x, y)| {
            rectangles_intersect(
                x as i32,
                y as i32,
                width_px,
                height_px,
                target.x,
                target.y,
                target.width as i32,
                target.height as i32,
            )
        })
    });
    let target = if saved_position_is_usable {
        saved.unwrap()
    } else {
        active
    };
    let (width_dip, height_dip) = constrained_size(state, target);
    let width_px = (width_dip as f64 * target.scale_factor).round() as i32;
    let height_px = (height_dip as f64 * target.scale_factor).round() as i32;

    let (x, y) = if saved_position_is_usable {
        let (x, y) = (state.x.unwrap() as i32, state.y.unwrap() as i32);
        (
            clamp_axis(x, target.x, target.width as i32, width_px),
            clamp_axis(y, target.y, target.height as i32, height_px),
        )
    } else {
        (
            target.x + (target.width as i32 - width_px).max(0) / 2,
            target.y + (target.height as i32 - height_px).max(0) / 2,
        )
    };

    Some(WindowPlacement {
        x,
        y,
        width_dip,
        height_dip,
        monitor_id: target.id.clone(),
        scale_factor: target.scale_factor,
    })
}

fn constrained_size(state: &database::WindowState, monitor: &MonitorArea) -> (i64, i64) {
    (
        state
            .width_dip
            .max(crate::config::MIN_WINDOW_WIDTH as i64)
            .min((monitor.width as f64 / monitor.scale_factor).floor() as i64),
        state
            .height_dip
            .max(crate::config::MIN_WINDOW_HEIGHT as i64)
            .min((monitor.height as f64 / monitor.scale_factor).floor() as i64),
    )
}

fn clamp_axis(value: i32, start: i32, available: i32, window: i32) -> i32 {
    value.clamp(start, start.saturating_add((available - window).max(0)))
}

#[allow(clippy::too_many_arguments)]
fn rectangles_intersect(
    x1: i32,
    y1: i32,
    w1: i32,
    h1: i32,
    x2: i32,
    y2: i32,
    w2: i32,
    h2: i32,
) -> bool {
    x1 < x2.saturating_add(w2)
        && x1.saturating_add(w1) > x2
        && y1 < y2.saturating_add(h2)
        && y1.saturating_add(h1) > y2
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

    fn monitor(id: &str, x: i32, width: u32, scale_factor: f64) -> MonitorArea {
        MonitorArea {
            id: id.into(),
            x,
            y: 0,
            width,
            height: 1040,
            scale_factor,
        }
    }

    fn state(x: Option<i64>, monitor_id: Option<&str>) -> database::WindowState {
        database::WindowState {
            window_label: "main".into(),
            width_dip: 680,
            height_dip: 720,
            x,
            y: x.map(|_| 40),
            monitor_id: monitor_id.map(str::to_string),
            scale_factor: Some(1.0),
            updated_at: 1,
        }
    }

    #[test]
    fn placement_clamps_partial_overlap_to_the_work_area() {
        let monitors = [monitor("primary", 0, 1920, 1.0)];
        let placement = resolve_placement(
            &state(Some(-200), Some("primary")),
            &monitors,
            Some("primary"),
        )
        .unwrap();
        assert_eq!(placement.x, 0);
        assert_eq!(placement.monitor_id, "primary");
    }

    #[test]
    fn placement_recovers_disconnected_monitor_on_active_monitor() {
        let monitors = [
            monitor("primary", 0, 1920, 1.0),
            monitor("active", 1920, 2560, 1.25),
        ];
        let placement = resolve_placement(
            &state(Some(5000), Some("disconnected")),
            &monitors,
            Some("active"),
        )
        .unwrap();
        assert_eq!(placement.monitor_id, "active");
        assert!(placement.x >= 1920);
        assert_eq!(placement.scale_factor, 1.25);
    }

    #[test]
    fn placement_recenters_a_fully_offscreen_rectangle() {
        let monitors = [monitor("primary", 0, 1920, 1.0)];
        let placement = resolve_placement(
            &state(Some(4000), Some("primary")),
            &monitors,
            Some("primary"),
        )
        .unwrap();
        assert_eq!(placement.x, (1920 - 680) / 2);
    }

    #[test]
    fn placement_reconstrains_size_after_switching_to_a_smaller_active_monitor() {
        let monitors = [
            MonitorArea {
                id: "saved".into(),
                x: 0,
                y: 0,
                width: 3840,
                height: 2160,
                scale_factor: 1.0,
            },
            MonitorArea {
                id: "active".into(),
                x: 3840,
                y: 0,
                width: 800,
                height: 600,
                scale_factor: 1.0,
            },
        ];
        let mut oversized = state(Some(8000), Some("saved"));
        oversized.width_dip = 1600;
        oversized.height_dip = 1200;

        let placement = resolve_placement(&oversized, &monitors, Some("active")).unwrap();

        assert_eq!(placement.monitor_id, "active");
        assert_eq!(placement.width_dip, 800);
        assert_eq!(placement.height_dip, 600);
        assert_eq!((placement.x, placement.y), (3840, 0));
    }
}
