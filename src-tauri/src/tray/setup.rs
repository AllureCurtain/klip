use tauri::{
    menu::{Menu, MenuItem, CheckMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager,
};

pub fn setup_tray(app_handle: &AppHandle) -> Result<TrayIcon, String> {
    tracing::info!("Setting up tray icon...");

    // Get current auto_start state from config
    let db = app_handle.state::<crate::database::Database>();
    let auto_start_enabled = crate::database::config::get(&db, "auto_start")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    let show_item = MenuItem::with_id(app_handle, "show", "显示窗口", true, None::<&str>)
        .map_err(|e| format!("Failed to create show item: {}", e))?;

    let autostart_item = CheckMenuItem::with_id(
        app_handle,
        "autostart",
        "开机自启",
        true,
        auto_start_enabled,
        None::<&str>,
    )
    .map_err(|e| format!("Failed to create autostart item: {}", e))?;

    let settings_item = MenuItem::with_id(app_handle, "settings", "设置", true, None::<&str>)
        .map_err(|e| format!("Failed to create settings item: {}", e))?;

    let about_item = MenuItem::with_id(app_handle, "about", "关于", true, None::<&str>)
        .map_err(|e| format!("Failed to create about item: {}", e))?;

    let quit_item = MenuItem::with_id(app_handle, "quit", "退出", true, None::<&str>)
        .map_err(|e| format!("Failed to create quit item: {}", e))?;

    let menu = Menu::with_items(
        app_handle,
        &[&show_item, &autostart_item, &settings_item, &about_item, &quit_item],
    )
    .map_err(|e| format!("Failed to create menu: {}", e))?;

    tracing::info!("Menu created");

    let tray = TrayIconBuilder::new()
        .icon(app_handle.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            tracing::info!("Menu event: {:?}", event.id);
            match event.id.as_ref() {
                "show" => {
                    tracing::info!("Show menu item clicked");
                    if let Some(window) = app.get_webview_window("main") {
                        // Capture the foreground window BEFORE we steal focus,
                        // so paste can restore it later.
                        crate::capture_previous_foreground();
                        if let Err(e) = window.show() {
                            tracing::error!("Failed to show window: {}", e);
                        }
                        if let Err(e) = window.set_focus() {
                            tracing::error!("Failed to focus window: {}", e);
                        }
                    }
                }
                "autostart" => {
                    tracing::info!("Autostart menu item clicked");
                    let db = app.state::<crate::database::Database>();
                    let current = crate::database::config::get(&db, "auto_start")
                        .ok()
                        .flatten()
                        .map(|v| v == "true")
                        .unwrap_or(false);
                    if let Err(e) = crate::commands::set_auto_start(
                        app.clone(),
                        db,
                        !current,
                    ) {
                        tracing::error!("Failed to toggle autostart: {}", e);
                    }
                }
                "settings" => {
                    tracing::info!("Settings menu item clicked");
                    // TODO: Open settings UI
                }
                "about" => {
                    tracing::info!("About menu item clicked");
                    // TODO: Show about dialog
                }
                "quit" => {
                    tracing::info!("Quit menu item clicked");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == tauri::tray::MouseButton::Left {
                    match button_state {
                        tauri::tray::MouseButtonState::Down => {
                            // Set guard on mouse-down BEFORE the OS processes focus changes,
                            // so the focus-lost handler won't hide the window during toggle.
                            crate::notify_tray_click();

                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                if is_visible {
                                    let _ = window.hide();
                                } else {
                                    // Capture the foreground window before Klip
                                    // becomes foreground itself.
                                    crate::capture_previous_foreground();
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        tauri::tray::MouseButtonState::Up => {
                            // Refresh guard on mouse-up so the window stays visible
                            // while the tray interaction settles.
                            crate::notify_tray_click();
                        }
                    }
                }
            }
        })
        .build(app_handle)
        .map_err(|e| format!("Failed to build tray: {}", e))?;

    tracing::info!("Tray icon created successfully");
    Ok(tray)
}
