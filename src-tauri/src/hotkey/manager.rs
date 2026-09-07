use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::config::registry;
use crate::AppError;

static OWNED_SHORTCUTS: OnceLock<Mutex<HashMap<String, Shortcut>>> = OnceLock::new();

fn owned_shortcuts() -> &'static Mutex<HashMap<String, Shortcut>> {
    OWNED_SHORTCUTS.get_or_init(|| Mutex::new(HashMap::new()))
}

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
        assert!(validate_config_value(registry::KEY_HOTKEY_TOGGLE_WINDOW, "Ctrl+Alt+K").is_ok());
        assert!(validate_config_value(registry::KEY_HOTKEY_QUICK_PASTE_PREFIX, "Ctrl+Alt").is_ok());
        assert!(validate_config_value(registry::KEY_CLOSE_TO_TRAY, "true").is_ok());
    }

    #[test]
    fn rejects_invalid_runtime_consumed_hotkey_values() {
        assert!(validate_config_value(registry::KEY_HOTKEY_TOGGLE_WINDOW, "Ctrl+Shift+K").is_err());
        assert!(
            validate_config_value(registry::KEY_HOTKEY_QUICK_PASTE_PREFIX, "Ctrl+Shift").is_err()
        );
    }

    #[test]
    fn parses_and_normalizes_supported_product_shortcuts() {
        assert_eq!(parse_accelerator("win+ctrl+k").unwrap().0, "Ctrl+Win+K");
        assert_eq!(
            parse_accelerator("Alt+Shift+PageDown").unwrap().0,
            "Alt+Shift+PageDown"
        );
        assert_eq!(parse_accelerator("Ctrl+F11").unwrap().0, "Ctrl+F11");
    }

    #[test]
    fn every_letter_can_be_used_as_a_shortcut_trigger() {
        for letter in 'A'..='Z' {
            let accelerator = format!("Ctrl+Shift+{letter}");
            let (normalized, shortcut) = parse_accelerator(&accelerator).unwrap();
            assert_eq!(normalized, accelerator);
            if letter == 'F' {
                assert_eq!(
                    shortcut,
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyF)
                );
            }
        }
    }

    #[test]
    fn rejects_reserved_and_unsafe_shortcuts() {
        for shortcut in [
            "Win+L",
            "Win+V",
            "Win+Tab",
            "Win+Shift+S",
            "Alt+Tab",
            "Alt+F4",
            "Ctrl+Alt+Delete",
            "Ctrl+Shift+Esc",
        ] {
            let error = parse_accelerator(shortcut).unwrap_err().to_string();
            assert!(error.contains("reserved"), "{shortcut}: {error}");
        }
        assert!(parse_accelerator("Ctrl+F12").is_err());
        assert!(parse_accelerator("K").is_err());
    }

    #[test]
    fn command_normalization_returns_canonical_storage_strings() {
        let bindings = crate::database::productization::SHORTCUT_ACTIONS
            .iter()
            .map(|action_id| crate::database::ShortcutBinding {
                action_id: (*action_id).to_string(),
                enabled: *action_id == "toggle_window",
                accelerator: (*action_id == "toggle_window")
                    .then(|| "win+ctrl+pagedown".to_string()),
                updated_at: 0,
            })
            .collect::<Vec<_>>();

        let normalized = normalize_bindings_for_command(&bindings).unwrap();

        assert_eq!(normalized.len(), bindings.len());
        assert!(normalized[1..]
            .iter()
            .all(|binding| !binding.enabled && binding.accelerator.is_none()));
        assert_eq!(
            normalized[0].accelerator.as_deref(),
            Some("Ctrl+Win+PageDown")
        );
    }

    #[test]
    fn cleared_shortcut_survives_a_storage_round_trip() {
        let db = crate::Database::from_conn(rusqlite::Connection::open_in_memory().unwrap());
        db.init_schema().unwrap();
        let mut bindings = crate::database::productization::list_shortcut_bindings(&db).unwrap();
        bindings[0].enabled = false;
        bindings[0].accelerator = None;

        let normalized = normalize_bindings_for_command(&bindings).unwrap();
        crate::database::productization::replace_shortcut_bindings(&db, &normalized).unwrap();
        let restored = crate::database::productization::list_shortcut_bindings(&db).unwrap();

        assert_eq!(restored.len(), 10);
        assert!(!restored[0].enabled);
        assert!(restored[0].accelerator.is_none());
        assert!(normalize_bindings_for_command(&restored).is_ok());
    }
}

pub fn register_hotkeys(app_handle: &AppHandle) -> Result<(), AppError> {
    let db = app_handle.state::<crate::database::Database>();
    let bindings = crate::database::productization::list_shortcut_bindings(&db)?;
    apply_bindings(app_handle, &bindings)
}

pub fn reload_hotkeys(app_handle: &AppHandle) -> Result<(), AppError> {
    register_hotkeys(app_handle)
}

pub fn apply_bindings(
    app_handle: &AppHandle,
    bindings: &[crate::database::types::ShortcutBinding],
) -> Result<(), AppError> {
    let parsed = validate_bindings(bindings)?;
    let global = app_handle.global_shortcut();
    let old = owned_shortcuts()
        .lock()
        .map_err(|e| AppError::Hotkey(format!("shortcut registry poisoned: {}", e)))?
        .clone();

    let target = parsed
        .into_iter()
        .filter(|(binding, _)| binding.enabled)
        .filter_map(|(binding, shortcut)| shortcut.map(|shortcut| (binding.action_id, shortcut)))
        .collect::<HashMap<_, _>>();
    let changed_old = old
        .iter()
        .filter(|(action_id, shortcut)| target.get(*action_id) != Some(*shortcut))
        .map(|(action_id, shortcut)| (action_id.clone(), *shortcut))
        .collect::<Vec<_>>();
    let changed_new = target
        .iter()
        .filter(|(action_id, shortcut)| old.get(*action_id) != Some(*shortcut))
        .map(|(action_id, shortcut)| (action_id.clone(), *shortcut))
        .collect::<Vec<_>>();

    let mut removed = Vec::new();
    for (action_id, shortcut) in changed_old {
        if let Err(error) = global.unregister(shortcut) {
            let rollback_errors = restore_shortcuts(app_handle, &removed);
            return Err(AppError::Hotkey(rollback_message(
                format!("failed to unregister shortcut for {action_id}: {error}"),
                rollback_errors,
            )));
        }
        removed.push((action_id, shortcut));
    }

    let mut registered = Vec::new();
    for (action_id, shortcut) in changed_new {
        if let Err(error) = register_action_shortcut(app_handle, &action_id, shortcut) {
            let mut rollback_errors = Vec::new();
            for (_, registered_shortcut) in &registered {
                if let Err(unregister_error) = global.unregister(*registered_shortcut) {
                    rollback_errors.push(format!(
                        "new registration {registered_shortcut:?}: {unregister_error}"
                    ));
                }
            }
            rollback_errors.extend(restore_shortcuts(app_handle, &removed));
            return Err(AppError::Hotkey(rollback_message(
                format!("failed to register shortcut for {action_id}: {error}"),
                rollback_errors,
            )));
        }
        registered.push((action_id, shortcut));
    }

    *owned_shortcuts()
        .lock()
        .map_err(|e| AppError::Hotkey(format!("shortcut registry poisoned: {}", e)))? = target;
    Ok(())
}

fn register_action_shortcut(
    app_handle: &AppHandle,
    action_id: &str,
    shortcut: Shortcut,
) -> Result<(), String> {
    let action_id = action_id.to_owned();
    let app = app_handle.clone();
    app_handle
        .global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            if crate::window::controller::is_focus_loss_suppressed() {
                tracing::debug!("Ignoring owned shortcut during an interactive capture flow");
                return;
            }
            match action_id.as_str() {
                "toggle_window" => {
                    if let Err(error) = crate::window::controller::toggle_main_window(&app) {
                        tracing::error!("toggle shortcut failed: {}", error);
                    }
                }
                action if action.starts_with("quick_paste_") => {
                    if let Ok(index) = action.trim_start_matches("quick_paste_").parse::<i64>() {
                        let db = app.state::<crate::database::Database>();
                        let visible = app.state::<crate::hotkey::VisibleClipboardItems>();
                        if let Err(error) =
                            crate::clipboard::paste::quick_paste(&app, &db, &visible, index)
                        {
                            tracing::error!("quick paste {} failed: {}", index, error);
                        }
                    }
                }
                _ => {}
            }
        })
        .map_err(|error| error.to_string())
}

fn restore_shortcuts(app_handle: &AppHandle, shortcuts: &[(String, Shortcut)]) -> Vec<String> {
    shortcuts
        .iter()
        .filter_map(|(action_id, shortcut)| {
            register_action_shortcut(app_handle, action_id, *shortcut)
                .err()
                .map(|error| format!("{action_id}: {error}"))
        })
        .collect()
}

fn rollback_message(message: String, rollback_errors: Vec<String>) -> String {
    if rollback_errors.is_empty() {
        message
    } else {
        format!(
            "{message}; failed to restore previous shortcuts: {}",
            rollback_errors.join(", ")
        )
    }
}

fn validate_bindings(
    bindings: &[crate::database::types::ShortcutBinding],
) -> Result<Vec<(crate::database::types::ShortcutBinding, Option<Shortcut>)>, AppError> {
    if bindings.len() != crate::database::productization::SHORTCUT_ACTIONS.len() {
        return Err(AppError::Hotkey(
            "all 10 shortcut actions are required".into(),
        ));
    }
    let mut actions = HashSet::new();
    let mut accelerators = HashSet::new();
    let mut parsed = Vec::with_capacity(bindings.len());
    for binding in bindings {
        if !crate::database::productization::SHORTCUT_ACTIONS.contains(&binding.action_id.as_str())
        {
            return Err(AppError::Hotkey(format!(
                "unknown shortcut action {}",
                binding.action_id
            )));
        }
        if !actions.insert(binding.action_id.as_str()) {
            return Err(AppError::Hotkey(format!(
                "duplicate shortcut action {}",
                binding.action_id
            )));
        }
        if let Some(raw) = binding.accelerator.as_deref() {
            let (normalized, shortcut) = parse_accelerator(raw)?;
            if binding.enabled && !accelerators.insert(normalized.clone()) {
                return Err(AppError::Hotkey(format!(
                    "duplicate shortcut accelerator {}",
                    normalized
                )));
            }
            let mut normalized_binding = binding.clone();
            normalized_binding.accelerator = Some(normalized);
            parsed.push((normalized_binding, Some(shortcut)));
        } else if binding.enabled {
            return Err(AppError::Hotkey(format!(
                "shortcut {} is enabled without a key",
                binding.action_id
            )));
        } else {
            parsed.push((binding.clone(), None));
        }
    }
    Ok(parsed)
}

pub fn normalize_bindings_for_command(
    bindings: &[crate::database::types::ShortcutBinding],
) -> Result<Vec<crate::database::types::ShortcutBinding>, AppError> {
    validate_bindings(bindings)
        .map(|parsed| parsed.into_iter().map(|(binding, _)| binding).collect())
}

pub fn parse_accelerator(raw: &str) -> Result<(String, Shortcut), AppError> {
    let parts: Vec<_> = raw
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < 2 {
        return Err(AppError::Hotkey(
            "shortcut requires a modifier and a trigger key".into(),
        ));
    }
    let mut modifiers = Modifiers::empty();
    let mut key: Option<&str> = None;
    for part in parts {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => modifiers |= Modifiers::CONTROL,
            "alt" => modifiers |= Modifiers::ALT,
            "shift" => modifiers |= Modifiers::SHIFT,
            "win" | "meta" | "super" => modifiers |= Modifiers::SUPER,
            _ if key.is_none() => key = Some(part),
            _ => {
                return Err(AppError::Hotkey(
                    "shortcut supports one trigger key only".into(),
                ))
            }
        }
    }
    if modifiers.is_empty() || key.is_none() {
        return Err(AppError::Hotkey(
            "shortcut requires a modifier and a trigger key".into(),
        ));
    }
    let key = key.unwrap();
    if is_reserved_parts(modifiers, key) {
        return Err(AppError::Hotkey(format!(
            "{} is reserved by Windows",
            raw.trim()
        )));
    }
    if key.eq_ignore_ascii_case("F12") {
        return Err(AppError::Hotkey(
            "F12 is reserved by Windows debugging tools".into(),
        ));
    }
    let code = parse_code(key)?;
    let normalized_key = normalize_key(key)?;
    let normalized = format!(
        "{}{}{}{}{}",
        if modifiers.contains(Modifiers::CONTROL) {
            "Ctrl+"
        } else {
            ""
        },
        if modifiers.contains(Modifiers::ALT) {
            "Alt+"
        } else {
            ""
        },
        if modifiers.contains(Modifiers::SHIFT) {
            "Shift+"
        } else {
            ""
        },
        if modifiers.contains(Modifiers::SUPER) {
            "Win+"
        } else {
            ""
        },
        normalized_key
    );
    if is_reserved_combination(&normalized) {
        return Err(AppError::Hotkey(format!(
            "{} is reserved by Windows",
            normalized
        )));
    }
    Ok((normalized, Shortcut::new(Some(modifiers), code)))
}

fn normalize_key(key: &str) -> Result<String, AppError> {
    if key.len() == 1
        && key
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
    {
        return Ok(key.to_ascii_uppercase());
    }
    if key.eq_ignore_ascii_case("space") {
        return Ok("Space".into());
    }
    let named_key = match key.to_ascii_lowercase().as_str() {
        "left" => Some("Left"),
        "right" => Some("Right"),
        "up" => Some("Up"),
        "down" => Some("Down"),
        "home" => Some("Home"),
        "end" => Some("End"),
        "pageup" => Some("PageUp"),
        "pagedown" => Some("PageDown"),
        "insert" => Some("Insert"),
        "delete" => Some("Delete"),
        _ => None,
    };
    if let Some(named_key) = named_key {
        return Ok(named_key.into());
    }
    if key.len() >= 2
        && key[..1].eq_ignore_ascii_case("f")
        && key[1..].parse::<u8>().is_ok_and(|n| (1..=11).contains(&n))
    {
        return Ok(key.to_ascii_uppercase());
    }
    Err(AppError::Hotkey(format!("unsupported trigger key {}", key)))
}

fn parse_code(key: &str) -> Result<Code, AppError> {
    let normalized = normalize_key(key)?;
    let code = match normalized.as_str() {
        "Space" => Code::Space,
        "Left" => Code::ArrowLeft,
        "Right" => Code::ArrowRight,
        "Up" => Code::ArrowUp,
        "Down" => Code::ArrowDown,
        "Home" => Code::Home,
        "End" => Code::End,
        "Pageup" | "PageUp" => Code::PageUp,
        "Pagedown" | "PageDown" => Code::PageDown,
        "Insert" => Code::Insert,
        "Delete" => Code::Delete,
        value if value.len() > 1 && value.starts_with('F') => {
            match value[1..].parse::<u8>().unwrap() {
                1 => Code::F1,
                2 => Code::F2,
                3 => Code::F3,
                4 => Code::F4,
                5 => Code::F5,
                6 => Code::F6,
                7 => Code::F7,
                8 => Code::F8,
                9 => Code::F9,
                10 => Code::F10,
                11 => Code::F11,
                _ => return Err(AppError::Hotkey("unsupported function key".into())),
            }
        }
        value if value.len() == 1 && value.chars().next().unwrap().is_ascii_digit() => {
            match value {
                "0" => Code::Digit0,
                "1" => Code::Digit1,
                "2" => Code::Digit2,
                "3" => Code::Digit3,
                "4" => Code::Digit4,
                "5" => Code::Digit5,
                "6" => Code::Digit6,
                "7" => Code::Digit7,
                "8" => Code::Digit8,
                "9" => Code::Digit9,
                _ => unreachable!(),
            }
        }
        value if value.len() == 1 => match value.chars().next().unwrap() {
            'A' => Code::KeyA,
            'B' => Code::KeyB,
            'C' => Code::KeyC,
            'D' => Code::KeyD,
            'E' => Code::KeyE,
            'F' => Code::KeyF,
            'G' => Code::KeyG,
            'H' => Code::KeyH,
            'I' => Code::KeyI,
            'J' => Code::KeyJ,
            'K' => Code::KeyK,
            'L' => Code::KeyL,
            'M' => Code::KeyM,
            'N' => Code::KeyN,
            'O' => Code::KeyO,
            'P' => Code::KeyP,
            'Q' => Code::KeyQ,
            'R' => Code::KeyR,
            'S' => Code::KeyS,
            'T' => Code::KeyT,
            'U' => Code::KeyU,
            'V' => Code::KeyV,
            'W' => Code::KeyW,
            'X' => Code::KeyX,
            'Y' => Code::KeyY,
            'Z' => Code::KeyZ,
            _ => return Err(AppError::Hotkey("unsupported key".into())),
        },
        _ => return Err(AppError::Hotkey(format!("unsupported trigger key {}", key))),
    };
    Ok(code)
}

fn is_reserved_combination(normalized: &str) -> bool {
    matches!(
        normalized,
        "Win+L"
            | "Win+V"
            | "Win+Tab"
            | "Shift+Win+S"
            | "Alt+Tab"
            | "Alt+F4"
            | "Ctrl+Alt+Delete"
            | "Ctrl+Shift+Esc"
    )
}

fn is_reserved_parts(modifiers: Modifiers, key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    (modifiers == Modifiers::SUPER && matches!(key.as_str(), "l" | "v" | "tab"))
        || (modifiers == (Modifiers::SUPER | Modifiers::SHIFT) && key == "s")
        || (modifiers == Modifiers::ALT && matches!(key.as_str(), "tab" | "f4"))
        || (modifiers == (Modifiers::CONTROL | Modifiers::ALT) && key == "delete")
        || (modifiers == (Modifiers::CONTROL | Modifiers::SHIFT) && key == "esc")
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
        registry::KEY_HOTKEY_TOGGLE_WINDOW => parse_toggle_shortcut(value).map(|_| ()),
        registry::KEY_HOTKEY_QUICK_PASTE_PREFIX => parse_quick_paste_prefix(value).map(|_| ()),
        _ => Ok(()),
    }
}

pub(crate) fn validate_hotkey_config(
    toggle_raw: &str,
    quick_paste_prefix_raw: &str,
) -> Result<(), AppError> {
    parse_hotkey_config(toggle_raw, quick_paste_prefix_raw).map(|_| ())
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
    if raw.trim() == registry::DEFAULT_QUICK_PASTE_PREFIX {
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
                if let Err(error) = crate::window::controller::toggle_main_window(&app_handle_clone)
                {
                    tracing::error!("Toggle shortcut failed: {}", error);
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
                registry::DEFAULT_QUICK_PASTE_PREFIX,
                index
            ),
            Err(e) => tracing::warn!(
                "Skipping quick paste {}+{}: {}",
                registry::DEFAULT_QUICK_PASTE_PREFIX,
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
    let visible_items = app_handle.state::<crate::hotkey::VisibleClipboardItems>();

    match crate::clipboard::paste::quick_paste(app_handle, &db, &visible_items, index) {
        Ok(true) => tracing::info!("Quick paste: pasted item at position {}", index),
        Ok(false) => tracing::warn!("Quick paste: no item at position {}", index),
        Err(error) => tracing::error!("Quick paste failed: {}", error),
    }
}
