#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use klip::commands;
use std::sync::atomic::Ordering;
use tauri::Manager;
use tracing_appender::non_blocking::WorkerGuard;

/// Wrapper so we can `app.manage()` the WorkerGuard. Tauri state requires
/// `Send + Sync + 'static`; WorkerGuard is `Send + Sync` but parking it as
/// state keeps it alive for the process lifetime, which is what the
/// non-blocking appender needs to flush buffered log entries.
struct LogGuardHolder(#[allow(dead_code)] WorkerGuard);

fn main() {
    eprintln!("Starting Klip...");

    let tray_click_guard = klip::get_tray_click_guard();
    let guard_ms = klip::tray_click_guard_ms();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
            // 初始化日志：stderr + 按天滚动落盘到 app_log_dir/klip.log
            let guard = init_tracing(app.handle());
            app.manage(LogGuardHolder(guard));
            tracing::info!("Tracing initialized");

            tracing::info!("Running setup...");

            // 初始化数据库
            tracing::info!("Initializing database...");
            klip::database::init(app.handle().clone())?;
            tracing::info!("Database initialized");

            // 启动剪贴板监听
            tracing::info!("Starting clipboard monitor...");
            klip::clipboard::start_monitor(app.handle().clone())?;
            tracing::info!("Clipboard monitor started");

            // 注册快捷键
            tracing::info!("Registering hotkeys...");
            klip::hotkey::register_hotkeys(app.handle())?;
            tracing::info!("Hotkeys registered");

            // 设置托盘
            tracing::info!("Setting up tray...");
            klip::tray::setup_tray(app.handle())?;
            tracing::info!("Tray setup complete");

            // 同步 autostart 状态：app_config.auto_start 是 source of truth，
            // 启动时把 OS 实际状态对齐到用户配置。
            sync_autostart_with_config(app.handle());

            // 设置窗口失焦自动隐藏（带托盘点击保护）
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                let guard_ts = tray_click_guard.clone();
                let guard_duration = guard_ms;
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let elapsed =
                            klip::now_millis().saturating_sub(guard_ts.load(Ordering::Relaxed));
                        if elapsed < guard_duration {
                            tracing::info!(
                                "Window lost focus within {}ms of tray click, skipping hide",
                                elapsed
                            );
                            return;
                        }
                        tracing::info!("Window lost focus, hiding...");
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                });
                tracing::info!("Window focus handler registered");
            } else {
                tracing::warn!("Main window not found during setup");
            }

            tracing::info!("Setup complete! Klip is running.");
            tracing::info!("Press Ctrl+Alt+K to toggle window");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_list,
            commands::search_clipboard,
            commands::get_clipboard_by_id,
            commands::delete_clipboard_item,
            commands::toggle_favorite,
            commands::clear_clipboard_history,
            commands::copy_to_clipboard,
            commands::paste_from_clipboard,
            commands::get_config,
            commands::get_all_config,
            commands::set_config,
            commands::toggle_window,
            commands::show_window,
            commands::hide_window,
            commands::set_auto_start,
            commands::is_auto_start_enabled,
            commands::get_system_info,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!("Error running Tauri application: {}", e);
        panic!("error while running tauri application: {}", e);
    }
}

/// Reconcile the OS-level autostart setting with the user preference stored in
/// `app_config.auto_start`. The app_config row wins so a fresh install on a new
/// machine inherits the user's last choice instead of the OS default.
fn sync_autostart_with_config(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_autostart::ManagerExt;

    let db = app.state::<klip::database::Database>();
    let want_enabled = match klip::database::config::get(&db, "auto_start") {
        Ok(Some(v)) => v == "true",
        _ => return, // No preference saved yet — leave OS state alone.
    };

    let manager = app.autolaunch();
    let actually_enabled = manager.is_enabled().unwrap_or(false);
    if want_enabled == actually_enabled {
        return;
    }

    let result = if want_enabled {
        manager.enable()
    } else {
        manager.disable()
    };

    match result {
        Ok(()) => tracing::info!("Autostart synced: {} -> {}", actually_enabled, want_enabled),
        Err(e) => tracing::warn!("Failed to sync autostart: {}", e),
    }
}

/// Initialize the global tracing subscriber with two outputs:
///   1. stderr (so `pnpm tauri:dev` shows logs in the terminal)
///   2. a daily-rotating file under the OS-standard log dir, e.g.
///      Windows: %LOCALAPPDATA%\com.klip.app\logs\klip.log.YYYY-MM-DD
///      macOS:   ~/Library/Logs/com.klip.app/klip.log.YYYY-MM-DD
///      Linux:   ~/.local/share/com.klip.app/logs/klip.log.YYYY-MM-DD
///
/// Returns the non-blocking appender's `WorkerGuard`; the caller MUST keep it
/// alive for the lifetime of the process or buffered log entries are dropped.
fn init_tracing(app: &tauri::AppHandle) -> WorkerGuard {
    use tracing_appender::rolling::{RollingFileAppender, Rotation};
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    let log_dir = app
        .path()
        .app_log_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("klip-logs"));
    let _ = std::fs::create_dir_all(&log_dir);

    let appender = RollingFileAppender::new(Rotation::DAILY, &log_dir, "klip.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(appender);

    let env_filter = EnvFilter::try_from_env("KLIP_LOG").unwrap_or_else(|_| EnvFilter::new("info"));

    let registry = tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt::Layer::new().with_writer(std::io::stderr))
        .with(fmt::Layer::new().with_writer(non_blocking).with_ansi(false));

    if registry.try_init().is_err() {
        eprintln!("tracing subscriber already set, skipping re-init");
    }

    eprintln!("Logs writing to: {}", log_dir.display());
    guard
}
