use crate::AppError;

pub const KEY_MAX_HISTORY_COUNT: &str = "max_history_count";
pub const KEY_HOTKEY_TOGGLE_WINDOW: &str = "hotkey_toggle_window";
pub const KEY_HOTKEY_QUICK_PASTE_PREFIX: &str = "hotkey_quick_paste_prefix";
pub const KEY_AUTO_START: &str = "auto_start";
pub const KEY_CLOSE_TO_TRAY: &str = "close_to_tray";
pub const KEY_SHOW_IN_TRAY: &str = "show_in_tray";
pub const KEY_WINDOW_WIDTH: &str = "window_width";
pub const KEY_WINDOW_HEIGHT: &str = "window_height";
pub const KEY_SEARCH_DEBOUNCE_MS: &str = "search_debounce_ms";
pub const KEY_LANGUAGE: &str = "language";
pub const KEY_SENSITIVE_CAPTURE_POLICY: &str = "sensitive_capture_policy";
pub const KEY_MASK_SENSITIVE_PREVIEWS: &str = "mask_sensitive_previews";
pub const KEY_CLIPBOARD_MONITOR_ENABLED: &str = "clipboard_monitor_enabled";
pub const KEY_PRIVACY_MODE_UNTIL: &str = "privacy_mode_until";
pub const KEY_ADVANCED_SEARCH_EXACT: &str = "advanced_search_exact";
pub const KEY_UPDATES_ENABLED: &str = "updates_enabled";
pub const KEY_UPDATE_FEED_URL: &str = "update_feed_url";
pub const KEY_ENCRYPTION_ENABLED: &str = "encryption_enabled";
pub const KEY_ENCRYPTION_STATUS: &str = "encryption_status";
pub const KEY_SYNC_FOLDER: &str = "sync_folder";
pub const KEY_PLUGIN_FOLDER: &str = "plugin_folder";
pub const KEY_LLM_PROVIDER: &str = "llm_provider";
pub const KEY_LLM_API_KEY: &str = "llm_api_key";
pub const KEY_LLM_MODEL: &str = "llm_model";
pub const KEY_LLM_BASE_URL: &str = "llm_base_url";
pub const KEY_LLM_MAX_CONTEXT_ITEMS: &str = "llm_max_context_items";
/// Optional access token for the local HTTP API. Empty (the default) disables
/// authentication and preserves the pre-token behavior exactly.
pub const KEY_HTTP_ACCESS_TOKEN: &str = "http_access_token";

pub const DEFAULT_TOGGLE_HOTKEY: &str = "Ctrl+Alt+K";
pub const DEFAULT_QUICK_PASTE_PREFIX: &str = "Ctrl+Alt";
pub const DEFAULT_LLM_PROVIDER: &str = "fake";
pub const DEFAULT_LLM_MODEL: &str = "gpt-4o-mini";
pub const DEFAULT_LLM_BASE_URL: &str = "https://api.openai.com/v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeEffect {
    None,
    HotkeyReload,
    WindowSize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConfigValueKind {
    Boolean,
    Integer,
    String,
}

#[derive(Debug, Clone, Copy)]
pub struct ConfigDescriptor {
    pub key: &'static str,
    pub default_value: &'static str,
    pub kind: ConfigValueKind,
    pub effect: RuntimeEffect,
}

impl ConfigDescriptor {
    pub fn normalize(&self, value: &str) -> Result<String, AppError> {
        match self.key {
            KEY_WINDOW_WIDTH => normalize_window_width(value),
            KEY_WINDOW_HEIGHT => normalize_window_height(value),
            KEY_HOTKEY_TOGGLE_WINDOW | KEY_HOTKEY_QUICK_PASTE_PREFIX => {
                crate::hotkey::manager::validate_config_value(self.key, value)?;
                Ok(value.to_string())
            }
            _ => normalize_by_kind(self.key, self.kind, value),
        }
    }
}

pub const CONFIG_REGISTRY: &[ConfigDescriptor] = &[
    ConfigDescriptor {
        key: KEY_MAX_HISTORY_COUNT,
        default_value: "100",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_HOTKEY_TOGGLE_WINDOW,
        default_value: DEFAULT_TOGGLE_HOTKEY,
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::HotkeyReload,
    },
    ConfigDescriptor {
        key: KEY_HOTKEY_QUICK_PASTE_PREFIX,
        default_value: DEFAULT_QUICK_PASTE_PREFIX,
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::HotkeyReload,
    },
    ConfigDescriptor {
        key: KEY_AUTO_START,
        default_value: "false",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_CLOSE_TO_TRAY,
        default_value: "true",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_SHOW_IN_TRAY,
        default_value: "true",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_WINDOW_WIDTH,
        default_value: "560",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::WindowSize,
    },
    ConfigDescriptor {
        key: KEY_WINDOW_HEIGHT,
        default_value: "760",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::WindowSize,
    },
    ConfigDescriptor {
        key: KEY_SEARCH_DEBOUNCE_MS,
        default_value: "150",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LANGUAGE,
        default_value: "zh-CN",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_SENSITIVE_CAPTURE_POLICY,
        default_value: "flag",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_MASK_SENSITIVE_PREVIEWS,
        default_value: "true",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_CLIPBOARD_MONITOR_ENABLED,
        default_value: "true",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_PRIVACY_MODE_UNTIL,
        default_value: "0",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_ADVANCED_SEARCH_EXACT,
        default_value: "false",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_UPDATES_ENABLED,
        default_value: "false",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_UPDATE_FEED_URL,
        default_value: "",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_ENCRYPTION_ENABLED,
        default_value: "false",
        kind: ConfigValueKind::Boolean,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_ENCRYPTION_STATUS,
        default_value: "off",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_SYNC_FOLDER,
        default_value: "",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_PLUGIN_FOLDER,
        default_value: "",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LLM_PROVIDER,
        default_value: DEFAULT_LLM_PROVIDER,
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LLM_API_KEY,
        default_value: "",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LLM_MODEL,
        default_value: DEFAULT_LLM_MODEL,
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LLM_BASE_URL,
        default_value: DEFAULT_LLM_BASE_URL,
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_LLM_MAX_CONTEXT_ITEMS,
        default_value: "8",
        kind: ConfigValueKind::Integer,
        effect: RuntimeEffect::None,
    },
    ConfigDescriptor {
        key: KEY_HTTP_ACCESS_TOKEN,
        default_value: "",
        kind: ConfigValueKind::String,
        effect: RuntimeEffect::None,
    },
];

pub fn descriptor(key: &str) -> Option<&'static ConfigDescriptor> {
    CONFIG_REGISTRY.iter().find(|entry| entry.key == key)
}

pub fn require_descriptor(key: &str) -> Result<&'static ConfigDescriptor, AppError> {
    descriptor(key).ok_or_else(|| AppError::InvalidInput(format!("unknown config key: {}", key)))
}

pub fn default_entries() -> impl Iterator<Item = (&'static str, &'static str)> {
    CONFIG_REGISTRY
        .iter()
        .map(|descriptor| (descriptor.key, descriptor.default_value))
}

fn normalize_window_width(value: &str) -> Result<String, AppError> {
    value
        .parse::<u32>()
        .map(crate::config::clamp_window_width)
        .map(|value| value.to_string())
        .map_err(|_| AppError::InvalidInput(format!("{KEY_WINDOW_WIDTH} must be a number")))
}

fn normalize_window_height(value: &str) -> Result<String, AppError> {
    value
        .parse::<u32>()
        .map(crate::config::clamp_window_height)
        .map(|value| value.to_string())
        .map_err(|_| AppError::InvalidInput(format!("{KEY_WINDOW_HEIGHT} must be a number")))
}

fn normalize_by_kind(key: &str, kind: ConfigValueKind, value: &str) -> Result<String, AppError> {
    match kind {
        ConfigValueKind::Boolean => match value {
            "true" | "false" => Ok(value.to_string()),
            _ => Err(AppError::InvalidInput(format!(
                "{} must be true or false",
                key
            ))),
        },
        ConfigValueKind::Integer => value
            .parse::<i64>()
            .map(|_| value.to_string())
            .map_err(|_| AppError::InvalidInput(format!("{} must be a number", key))),
        ConfigValueKind::String => Ok(value.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_defines_unique_default_for_each_key() {
        let mut keys = std::collections::HashSet::new();
        for descriptor in CONFIG_REGISTRY {
            assert!(
                keys.insert(descriptor.key),
                "duplicate key {}",
                descriptor.key
            );
        }
    }

    #[test]
    fn registry_normalizes_window_size() {
        assert_eq!(
            require_descriptor(KEY_WINDOW_WIDTH)
                .unwrap()
                .normalize("300")
                .unwrap(),
            "360"
        );
        assert_eq!(
            require_descriptor(KEY_WINDOW_HEIGHT)
                .unwrap()
                .normalize("400")
                .unwrap(),
            "480"
        );
    }
}
