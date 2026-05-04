use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "windows")]
use enigo::{Enigo, Settings};

pub fn register_hotkeys(app_handle: &AppHandle) -> Result<(), String> {
    tracing::info!("Registering hotkeys...");

    // 窗口切换快捷键: Ctrl+Alt+K
    let toggle_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyK);
    let app_handle_clone = app_handle.clone();

    // 使用 on_shortcut 注册快捷键和回调
    app_handle
        .global_shortcut()
        .on_shortcut(toggle_shortcut, move |_app, _shortcut, event| {
            tracing::info!("Toggle shortcut event: {:?}", event.state);
            if event.state == ShortcutState::Pressed {
                tracing::info!("Ctrl+Alt+K pressed!");
                if let Some(window) = app_handle_clone.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    tracing::info!("Window visible: {}", is_visible);
                    if is_visible {
                        let _ = window.hide();
                        tracing::info!("Window hidden");
                    } else {
                        // Capture the foreground window BEFORE Klip becomes
                        // foreground so paste can restore focus to it.
                        crate::capture_previous_foreground();
                        let _ = window.show();
                        let _ = window.set_focus();
                        tracing::info!("Window shown and focused");
                    }
                } else {
                    tracing::error!("Main window not found!");
                }
            }
        })
        .map_err(|e| format!("Failed to register toggle shortcut: {}", e))?;

    tracing::info!("Toggle shortcut registered: Ctrl+Alt+K");

    // 快速粘贴快捷键 (Ctrl+Alt+1~9)
    // 历史上用过 Ctrl+1~9 但和 IDE/浏览器/IM 全局冲突严重，绝大多数机器
    // 上 9 个一个都注册不上，改用与主热键 Ctrl+Alt+K 同族的修饰组合。
    for i in 1..=9 {
        let code = match i {
            1 => Code::Digit1,
            2 => Code::Digit2,
            3 => Code::Digit3,
            4 => Code::Digit4,
            5 => Code::Digit5,
            6 => Code::Digit6,
            7 => Code::Digit7,
            8 => Code::Digit8,
            9 => Code::Digit9,
            _ => unreachable!(),
        };
        let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), code);
        let app_handle_clone = app_handle.clone();

        let result =
            app_handle
                .global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        quick_paste(&app_handle_clone, i);
                    }
                });

        match result {
            Ok(()) => tracing::info!("Quick paste shortcut Ctrl+Alt+{} registered", i),
            Err(e) => tracing::warn!("Skipping quick paste Ctrl+Alt+{}: {}", i, e),
        }
    }
    Ok(())
}

fn quick_paste(app_handle: &AppHandle, index: i64) {
    tracing::info!("Quick paste index {}", index);
    let db = app_handle.state::<crate::database::Database>();

    // 获取第 index 条记录（index 从 1 开始）
    // offset = index - 1, limit = 1
    if let Ok(items) = crate::database::clipboard::get_list(&db, 1, index - 1) {
        if let Some(item) = items.into_iter().next() {
            if crate::clipboard::copy_to_clipboard(
                &item.content,
                &item.content_type,
                item.metadata.as_deref(),
            )
            .is_ok()
            {
                tracing::info!("Quick paste: copied item {} (position {})", item.id, index);

                // Bump last_used_at so the item floats to the top.
                let _ = crate::database::clipboard::touch_last_used(&db, item.id);

                // 隐藏窗口
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                }

                // 模拟 Ctrl+V 粘贴
                #[cfg(target_os = "windows")]
                {
                    // 让 hide() 先开始传播，再把焦点恢复到 Klip 打开前的目标窗口，
                    // 否则 Ctrl+V 会发到桌面或错误的前台窗口（特别是 Win11）。
                    std::thread::sleep(std::time::Duration::from_millis(30));
                    let _ = crate::restore_previous_foreground();
                    std::thread::sleep(std::time::Duration::from_millis(120));
                    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
                        use enigo::Keyboard;
                        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
                        let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
                        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
                        tracing::info!("Quick paste: simulated Ctrl+V");
                    }
                }

                #[cfg(target_os = "macos")]
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
                        use enigo::Keyboard;
                        let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Press);
                        let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
                        let _ = enigo.key(enigo::Key::Meta, enigo::Direction::Release);
                        tracing::info!("Quick paste: simulated Cmd+V");
                    }
                }
            } else {
                tracing::error!("Quick paste: failed to copy to clipboard");
            }
        } else {
            tracing::warn!("Quick paste: no item at position {}", index);
        }
    } else {
        tracing::error!("Quick paste: failed to get clipboard list");
    }
}
