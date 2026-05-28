import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MAX_HISTORY_COUNT,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  SEARCH_DEBOUNCE_MS,
} from '@/lib/constants';
import type { AppConfig } from '@/types';

type ConfigKey = keyof AppConfig;
type ConfigValue = AppConfig[ConfigKey];
type RawConfig = Record<string, string | null | undefined>;

type ConfigDescriptor = {
  key: ConfigKey;
  defaultValue: ConfigValue;
  parse: (value: string | null | undefined) => ConfigValue;
  serialize: (value: ConfigValue) => string;
  persisted?: boolean;
};

export const CONFIG_KEYS = {
  maxHistoryCount: 'max_history_count',
  hotkeyToggleWindow: 'hotkey_toggle_window',
  hotkeyQuickPastePrefix: 'hotkey_quick_paste_prefix',
  autoStart: 'auto_start',
  closeToTray: 'close_to_tray',
  windowWidth: 'window_width',
  windowHeight: 'window_height',
  searchDebounceMs: 'search_debounce_ms',
  language: 'language',
  sensitiveCapturePolicy: 'sensitive_capture_policy',
  maskSensitivePreviews: 'mask_sensitive_previews',
  clipboardMonitorEnabled: 'clipboard_monitor_enabled',
  privacyModeUntil: 'privacy_mode_until',
  updatesEnabled: 'updates_enabled',
  updateFeedUrl: 'update_feed_url',
  encryptionEnabled: 'encryption_enabled',
  encryptionStatus: 'encryption_status',
  syncFolder: 'sync_folder',
  pluginFolder: 'plugin_folder',
} as const satisfies Record<string, ConfigKey>;

function parseBoolean(value: string | null | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue;
  return value === 'true';
}

function parseNumber(value: string | null | undefined, defaultValue: number): number {
  if (value == null) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function clampWindowWidth(value: number): number {
  return Math.max(MIN_WINDOW_WIDTH, value);
}

export function clampWindowHeight(value: number): number {
  return Math.max(MIN_WINDOW_HEIGHT, value);
}

function stringDescriptor(
  key: ConfigKey,
  defaultValue: string,
  persisted = true
): ConfigDescriptor {
  return {
    key,
    defaultValue,
    persisted,
    parse: (value) => value ?? defaultValue,
    serialize: (value) => String(value),
  };
}

function booleanDescriptor(key: ConfigKey, defaultValue: boolean): ConfigDescriptor {
  return {
    key,
    defaultValue,
    parse: (value) => parseBoolean(value, defaultValue),
    serialize: (value) => String(value),
  };
}

function numberDescriptor(
  key: ConfigKey,
  defaultValue: number,
  transform?: (value: number) => number
): ConfigDescriptor {
  return {
    key,
    defaultValue,
    parse: (value) => {
      const parsed = parseNumber(value, defaultValue);
      return transform ? transform(parsed) : parsed;
    },
    serialize: (value) => String(value),
  };
}

function sensitiveCapturePolicyDescriptor(): ConfigDescriptor {
  return {
    key: CONFIG_KEYS.sensitiveCapturePolicy,
    defaultValue: 'flag',
    parse: (value) => (value === 'skip' ? 'skip' : 'flag'),
    serialize: (value) => String(value),
  };
}

export const CONFIG_SCHEMA = [
  numberDescriptor(CONFIG_KEYS.maxHistoryCount, MAX_HISTORY_COUNT),
  stringDescriptor(CONFIG_KEYS.hotkeyToggleWindow, 'Ctrl+Alt+K'),
  stringDescriptor(CONFIG_KEYS.hotkeyQuickPastePrefix, 'Ctrl+Alt'),
  booleanDescriptor(CONFIG_KEYS.autoStart, false),
  booleanDescriptor(CONFIG_KEYS.closeToTray, true),
  numberDescriptor(CONFIG_KEYS.windowWidth, DEFAULT_WINDOW_WIDTH, clampWindowWidth),
  numberDescriptor(CONFIG_KEYS.windowHeight, DEFAULT_WINDOW_HEIGHT, clampWindowHeight),
  numberDescriptor(CONFIG_KEYS.searchDebounceMs, SEARCH_DEBOUNCE_MS),
  stringDescriptor(CONFIG_KEYS.language, 'zh-CN'),
  sensitiveCapturePolicyDescriptor(),
  booleanDescriptor(CONFIG_KEYS.maskSensitivePreviews, true),
  booleanDescriptor(CONFIG_KEYS.clipboardMonitorEnabled, true),
  numberDescriptor(CONFIG_KEYS.privacyModeUntil, 0),
  booleanDescriptor(CONFIG_KEYS.updatesEnabled, false),
  stringDescriptor(CONFIG_KEYS.updateFeedUrl, ''),
  booleanDescriptor(CONFIG_KEYS.encryptionEnabled, false),
  stringDescriptor(CONFIG_KEYS.encryptionStatus, 'off'),
  stringDescriptor(CONFIG_KEYS.syncFolder, ''),
  stringDescriptor(CONFIG_KEYS.pluginFolder, ''),
] as const satisfies readonly ConfigDescriptor[];

export const DEFAULT_CONFIG = CONFIG_SCHEMA.reduce(
  (config, descriptor) => ({
    ...config,
    [descriptor.key]: descriptor.defaultValue,
  }),
  {} as AppConfig
);

export function parseConfig(rawConfig: RawConfig): AppConfig {
  return CONFIG_SCHEMA.reduce(
    (config, descriptor) => ({
      ...config,
      [descriptor.key]: descriptor.parse(rawConfig[descriptor.key]),
    }),
    {} as AppConfig
  );
}

export function serializeConfig(config: AppConfig): Array<[ConfigKey, string]> {
  return CONFIG_SCHEMA.filter((descriptor) => descriptor.persisted !== false).map(
    (descriptor) => [
      descriptor.key,
      descriptor.serialize(config[descriptor.key]),
    ]
  );
}
