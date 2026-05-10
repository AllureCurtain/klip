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

            // 恢复开机自启动状态（从数据库配置同步）
            restore_autostart_state(app.handle());

            // 设置窗口失焦自动隐藏（带托盘点击保护）
            if let Some(window) = app.get_webview_window("main") {
                // 从配置读取窗口尺寸
                let db = app.state::<klip::database::Database>();
                let window_width: u32 = klip::database::config::get(&db, "window_width")
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(400);
                let window_height: u32 = klip::database::config::get(&db, "window_height")
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(600);

                if let Err(e) = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                    width: window_width,
                    height: window_height,
                })) {
                    tracing::warn!("Failed to set window size from config: {}", e);
                } else {
                    tracing::info!(
                        "Window size applied from config: {}x{}",
                        window_width,
                        window_height
                    );
                }

                let app_handle = app.handle().clone();
                let guard_ts = tray_click_guard.clone();
                let guard_duration = guard_ms;
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let db = app_handle.state::<klip::database::Database>();
                        let close_to_tray = klip::database::config::get(&db, "close_to_tray")
                            .ok()
                            .flatten()
                            .map(|v| v == "true")
                            .unwrap_or(true);

                        // 如果 close_to_tray 为 false，不自动隐藏窗口
                        if !close_to_tray {
                            tracing::debug!("close_to_tray is false, skipping auto-hide");
                            return;
                        }

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

/// Sync autostart state with persisted config on startup.
/// Respects user preference instead of always disabling.
fn restore_autostart_state(app: &tauri::AppHandle) {
    use tauri::Manager;
    use tauri_plugin_autostart::ManagerExt;

    let db = app.state::<klip::database::Database>();
    let config_enabled = klip::database::config::get(&db, "auto_start")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    let manager = app.autolaunch();
    match manager.is_enabled() {
        Ok(os_enabled) => {
            if config_enabled && !os_enabled {
                if let Err(e) = manager.enable() {
                    tracing::warn!("Failed to enable autostart at startup: {}", e);
                } else {
                    tracing::info!("Restored autostart state (enabled)");
                }
            } else if !config_enabled && os_enabled {
                if let Err(e) = manager.disable() {
                    tracing::warn!("Failed to disable autostart at startup: {}", e);
                } else {
                    tracing::info!("Restored autostart state (disabled)");
                }
            } else {
                tracing::info!(
                    "Autostart state already synced (config={}, os={})",
                    config_enabled,
                    os_enabled
                );
            }
        }
        Err(e) => tracing::warn!("Failed to query OS autostart state: {}", e),
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
