#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use klip::commands;
use tauri::Manager;

fn main() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    tracing::info!("Starting Klip...");

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]),
        ))
        .setup(|app| {
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

            // 设置窗口失焦自动隐藏
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
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
            commands::clear_clipboard_history,
            commands::copy_to_clipboard,
            commands::get_config,
            commands::get_all_config,
            commands::set_config,
            commands::toggle_window,
            commands::show_window,
            commands::hide_window,
            commands::set_auto_start,
            commands::get_system_info,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        tracing::error!("Error running Tauri application: {}", e);
        panic!("error while running tauri application: {}", e);
    }
}
