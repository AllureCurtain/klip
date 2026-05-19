use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))]
use enigo::{Enigo, Settings};

use crate::AppError;

pub(crate) const DEFAULT_TOGGLE_HOTKEY: &str = "Ctrl+Alt+K";
pub(crate) const DEFAULT_QUICK_PASTE_PREFIX: &str = "Ctrl+Alt";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_toggle_hotkey() {
        let parsed = parse_toggle_shortcut("Ctrl+Alt+K").unwrap();
        assert_eq!(
            parsed,
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyK)
        );
    }

    #[test]
    fn rejects_unsupported_toggle_hotkey_shape() {
        assert!(parse_toggle_shortcut("Ctrl+Shift+K").is_err());
        assert!(parse_toggle_shortcut("Alt+K").is_err());
    }

    #[test]
    fn parses_supported_quick_paste_prefix() {
        let parsed = parse_quick_paste_prefix("Ctrl+Alt").unwrap();
        assert_eq!(parsed, Modifiers::CONTROL | Modifiers::ALT);
    }

    #[test]
    fn rejects_unsupported_quick_paste_prefix() {
        assert!(parse_quick_paste_prefix("Ctrl+Shift").is_err());
        assert!(parse_quick_paste_prefix("Alt").is_err());
    }

    #[test]
    fn validates_runtime_consumed_hotkey_values() {
        assert!(validate_config_value("hotkey_toggle_window", "Ctrl+Alt+K").is_ok());
        assert!(validate_config_value("hotkey_quick_paste_prefix", "Ctrl+Alt").is_ok());
        assert!(validate_config_value("close_to_tray", "true").is_ok());
    }

    #[test]
    fn rejects_invalid_runtime_consumed_hotkey_values() {
        assert!(validate_config_value("hotkey_toggle_window", "Ctrl+Shift+K").is_err());
        assert!(validate_config_value("hotkey_quick_paste_prefix", "Ctrl+Shift").is_err());
    }
}

pub fn register_hotkeys(app_handle: &AppHandle) -> Result<(), AppError> {
    let (toggle_raw, quick_paste_prefix_raw) = read_hotkey_config(app_handle)?;
    tracing::info!(
        "Registering hotkeys with toggle={} quick_paste_prefix={}",
        toggle_raw,
        quick_paste_prefix_raw
    );

    register_hotkeys_from_values(app_handle, &toggle_raw, &quick_paste_prefix_raw)
}

pub fn reload_hotkeys(app_handle: &AppHandle) -> Result<(), AppError> {
    let (toggle_raw, quick_paste_prefix_raw) = read_hotkey_config(app_handle)?;
    tracing::info!(
        "Reloading hotkeys with toggle={} quick_paste_prefix={}",
        toggle_raw,
        quick_paste_prefix_raw
    );

    reload_hotkeys_from_values(app_handle, &toggle_raw, &quick_paste_prefix_raw)
}

pub(crate) fn reload_hotkeys_from_values(
    app_handle: &AppHandle,
    toggle_raw: &str,
    quick_paste_prefix_raw: &str,
) -> Result<(), AppError> {
    validate_hotkey_config(toggle_raw, quick_paste_prefix_raw)?;

    app_handle
        .global_shortcut()
        .unregister_all()
        .map_err(|e| AppError::Hotkey(format!("Failed to unregister hotkeys: {}", e)))?;

    register_hotkeys_from_values(app_handle, toggle_raw, quick_paste_prefix_raw)
}

pub fn validate_config_value(key: &str, value: &str) -> Result<(), AppError> {
    match key {
        "hotkey_toggle_window" => parse_toggle_shortcut(value).map(|_| ()),
        "hotkey_quick_paste_prefix" => parse_quick_paste_prefix(value).map(|_| ()),
        _ => Ok(()),
    }
}

pub(crate) fn validate_hotkey_config(
    toggle_raw: &str,
    quick_paste_prefix_raw: &str,
) -> Result<(), AppError> {
    parse_hotkey_config(toggle_raw, quick_paste_prefix_raw).map(|_| ())
}

fn read_hotkey_config(app_handle: &AppHandle) -> Result<(String, String), AppError> {
    let db = app_handle.state::<crate::database::Database>();
    let toggle_raw = crate::database::config::get(&db, "hotkey_toggle_window")?
        .unwrap_or_else(|| DEFAULT_TOGGLE_HOTKEY.to_string());
    let quick_paste_prefix_raw = crate::database::config::get(&db, "hotkey_quick_paste_prefix")?
        .unwrap_or_else(|| DEFAULT_QUICK_PASTE_PREFIX.to_string());

    Ok((toggle_raw, quick_paste_prefix_raw))
}

fn register_hotkeys_from_values(
    app_handle: &AppHandle,
    toggle_raw: &str,
    quick_paste_prefix_raw: &str,
) -> Result<(), AppError> {
    validate_hotkey_config(toggle_raw, quick_paste_prefix_raw)?;
    let toggle_shortcut = parse_toggle_shortcut(toggle_raw)?;
    let quick_paste_modifiers = parse_quick_paste_prefix(quick_paste_prefix_raw)?;

    register_toggle_hotkey(app_handle, toggle_shortcut)?;
    tracing::info!("Toggle shortcut registered: {}", toggle_raw);

    register_quick_paste_hotkeys(app_handle, quick_paste_modifiers)
}

fn parse_hotkey_config(
    toggle_raw: &str,
    quick_paste_prefix_raw: &str,
) -> Result<(Shortcut, Modifiers), AppError> {
    let toggle_shortcut = parse_toggle_shortcut(toggle_raw)?;
    let quick_paste_modifiers = parse_quick_paste_prefix(quick_paste_prefix_raw)?;
    Ok((toggle_shortcut, quick_paste_modifiers))
}

fn parse_toggle_shortcut(raw: &str) -> Result<Shortcut, AppError> {
    let trimmed = raw.trim();
    let Some(letter) = trimmed.strip_prefix("Ctrl+Alt+") else {
        return Err(AppError::Hotkey(format!(
            "Unsupported hotkey_toggle_window `{}`. Expected Ctrl+Alt+<A-Z>.",
            raw
        )));
    };

    if letter.len() != 1 {
        return Err(AppError::Hotkey(format!(
            "Unsupported hotkey_toggle_window `{}`. Expected Ctrl+Alt+<A-Z>.",
            raw
        )));
    }

    let code = parse_letter_code(letter.chars().next().unwrap())?;
    Ok(Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT),
        code,
    ))
}

fn parse_quick_paste_prefix(raw: &str) -> Result<Modifiers, AppError> {
    if raw.trim() == DEFAULT_QUICK_PASTE_PREFIX {
        Ok(Modifiers::CONTROL | Modifiers::ALT)
    } else {
        Err(AppError::Hotkey(format!(
            "Unsupported hotkey_quick_paste_prefix `{}`. Expected Ctrl+Alt.",
            raw
        )))
    }
}

fn parse_letter_code(letter: char) -> Result<Code, AppError> {
    match letter {
        'A' => Ok(Code::KeyA),
        'B' => Ok(Code::KeyB),
        'C' => Ok(Code::KeyC),
        'D' => Ok(Code::KeyD),
        'E' => Ok(Code::KeyE),
        'F' => Ok(Code::KeyF),
        'G' => Ok(Code::KeyG),
        'H' => Ok(Code::KeyH),
        'I' => Ok(Code::KeyI),
        'J' => Ok(Code::KeyJ),
        'K' => Ok(Code::KeyK),
        'L' => Ok(Code::KeyL),
        'M' => Ok(Code::KeyM),
        'N' => Ok(Code::KeyN),
        'O' => Ok(Code::KeyO),
        'P' => Ok(Code::KeyP),
        'Q' => Ok(Code::KeyQ),
        'R' => Ok(Code::KeyR),
        'S' => Ok(Code::KeyS),
        'T' => Ok(Code::KeyT),
        'U' => Ok(Code::KeyU),
        'V' => Ok(Code::KeyV),
        'W' => Ok(Code::KeyW),
        'X' => Ok(Code::KeyX),
        'Y' => Ok(Code::KeyY),
        'Z' => Ok(Code::KeyZ),
        _ => Err(AppError::Hotkey(format!(
            "Unsupported hotkey_toggle_window letter `{}`. Expected A-Z.",
            letter
        ))),
    }
}

fn register_toggle_hotkey(app_handle: &AppHandle, shortcut: Shortcut) -> Result<(), AppError> {
    let app_handle_clone = app_handle.clone();
    app_handle
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            tracing::info!("Toggle shortcut event: {:?}", event.state);
            if event.state == ShortcutState::Pressed {
                if let Some(window) = app_handle_clone.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    tracing::info!("Window visible: {}", is_visible);
                    if is_visible {
                        let _ = window.hide();
                        tracing::info!("Window hidden");
                    } else {
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
        .map_err(|e| AppError::Hotkey(format!("Failed to register toggle shortcut: {}", e)))
}

fn register_quick_paste_hotkeys(
    app_handle: &AppHandle,
    modifiers: Modifiers,
) -> Result<(), AppError> {
    for index in 1_i64..=9_i64 {
        let shortcut = Shortcut::new(Some(modifiers), quick_paste_digit_code(index));
        let app_handle_clone = app_handle.clone();

        let result =
            app_handle
                .global_shortcut()
                .on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        quick_paste(&app_handle_clone, index);
                    }
                });

        match result {
            Ok(()) => tracing::info!(
                "Quick paste shortcut {}+{} registered",
                DEFAULT_QUICK_PASTE_PREFIX,
                index
            ),
            Err(e) => tracing::warn!(
                "Skipping quick paste {}+{}: {}",
                DEFAULT_QUICK_PASTE_PREFIX,
                index,
                e
            ),
        }
    }

    Ok(())
}

fn quick_paste_digit_code(index: i64) -> Code {
    match index {
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
    }
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

                #[cfg(target_os = "linux")]
                {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
                        use enigo::Keyboard;
                        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Press);
                        let _ = enigo.key(enigo::Key::Unicode('v'), enigo::Direction::Click);
                        let _ = enigo.key(enigo::Key::Control, enigo::Direction::Release);
                        tracing::info!("Quick paste: simulated Ctrl+V");
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
