use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Manager,
};

pub fn setup_tray(app_handle: &AppHandle) -> Result<TrayIcon, String> {
    tracing::info!("Setting up tray icon...");

    let show_item = MenuItem::with_id(app_handle, "show", "显示窗口", true, None::<&str>)
        .map_err(|e| format!("Failed to create show item: {}", e))?;

    let quit_item = MenuItem::with_id(app_handle, "quit", "退出", true, None::<&str>)
        .map_err(|e| format!("Failed to create quit item: {}", e))?;

    let menu = Menu::with_items(app_handle, &[&show_item, &quit_item])
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
                        if let Err(e) = window.show() {
                            tracing::error!("Failed to show window: {}", e);
                        }
                        if let Err(e) = window.set_focus() {
                            tracing::error!("Failed to focus window: {}", e);
                        }
                    }
                }
                "quit" => {
                    tracing::info!("Quit menu item clicked");
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // 只处理左键单击（Up 状态），避免双击时的多次触发
            if let tauri::tray::TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                // 只响应左键松开事件
                if button == tauri::tray::MouseButton::Left
                    && button_state == tauri::tray::MouseButtonState::Up
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
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
