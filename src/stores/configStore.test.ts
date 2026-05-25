import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configApi } from '@/lib/tauri';
import { useConfigStore } from './configStore';
import type { AppConfig } from '@/types';

const TEST_CONFIG: AppConfig = {
  max_history_count: 100,
  hotkey_toggle_window: 'Ctrl+Alt+K',
  hotkey_quick_paste_prefix: 'Ctrl+Alt',
  auto_start: false,
  close_to_tray: true,
  window_width: 560,
  window_height: 760,
  search_debounce_ms: 150,
  language: 'zh-CN',
  sensitive_capture_policy: 'flag',
  mask_sensitive_previews: true,
  clipboard_monitor_enabled: true,
  privacy_mode_until: 0,
  updates_enabled: false,
  update_feed_url: '',
  encryption_enabled: false,
  encryption_status: 'off',
  sync_folder: '',
  plugin_folder: '',
};

vi.mock('@/lib/tauri', () => ({
  configApi: {
    getAll: vi.fn(),
    set: vi.fn(),
  },
  systemApi: {
    getInfo: vi.fn(),
    getDiagnostics: vi.fn(),
    setAutoStart: vi.fn(),
  },
}));

describe('configStore', () => {
  beforeEach(() => {
    useConfigStore.setState({
      config: TEST_CONFIG,
      loading: false,
      error: null,
      hasChanges: false,
      systemInfo: null,
      diagnosticsInfo: null,
    });
    vi.clearAllMocks();
  });

  it('defaults sensitive preview masking on when older config has no value', async () => {
    vi.mocked(configApi.getAll).mockResolvedValue({});

    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().config.mask_sensitive_previews).toBe(true);
  });

  it('defaults missing window size config to the current backend defaults', async () => {
    vi.mocked(configApi.getAll).mockResolvedValue({});

    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().config.window_width).toBe(560);
    expect(useConfigStore.getState().config.window_height).toBe(760);
  });

  it('clamps window size edits to the packaged minimums', () => {
    useConfigStore.getState().setWindowWidth(300);
    useConfigStore.getState().setWindowHeight(400);

    expect(useConfigStore.getState().config.window_width).toBe(360);
    expect(useConfigStore.getState().config.window_height).toBe(480);
  });

  it('persists sensitive preview masking with other config changes', async () => {
    useConfigStore.getState().setMaskSensitivePreviews(false);
    vi.mocked(configApi.set).mockResolvedValue(undefined);

    await useConfigStore.getState().saveChanges();

    expect(configApi.set).toHaveBeenCalledWith('mask_sensitive_previews', 'false');
  });

  it('loads product readiness config with stable defaults', async () => {
    vi.mocked(configApi.getAll).mockResolvedValue({
      clipboard_monitor_enabled: 'false',
      privacy_mode_until: '1234',
      updates_enabled: 'true',
      update_feed_url: 'https://updates.example.test/klip.json',
      encryption_enabled: 'true',
      encryption_status: 'ready',
      sync_folder: 'C:\\Klip Sync',
      plugin_folder: 'C:\\Klip Plugins',
    });

    await useConfigStore.getState().fetchConfig();

    expect(useConfigStore.getState().config.clipboard_monitor_enabled).toBe(false);
    expect(useConfigStore.getState().config.privacy_mode_until).toBe(1234);
    expect(useConfigStore.getState().config.updates_enabled).toBe(true);
    expect(useConfigStore.getState().config.update_feed_url).toBe(
      'https://updates.example.test/klip.json'
    );
    expect(useConfigStore.getState().config.encryption_enabled).toBe(true);
    expect(useConfigStore.getState().config.encryption_status).toBe('ready');
    expect(useConfigStore.getState().config.sync_folder).toBe('C:\\Klip Sync');
    expect(useConfigStore.getState().config.plugin_folder).toBe('C:\\Klip Plugins');
  });

  it('persists update, encryption, sync, plugin, and monitoring readiness settings', async () => {
    vi.mocked(configApi.set).mockResolvedValue(undefined);

    useConfigStore.getState().setClipboardMonitorEnabled(false);
    useConfigStore.getState().setUpdatesEnabled(true);
    useConfigStore.getState().setUpdateFeedUrl('https://updates.example.test/klip.json');
    useConfigStore.getState().setEncryptionEnabled(true);
    useConfigStore.getState().setSyncFolder('C:\\Klip Sync');
    useConfigStore.getState().setPluginFolder('C:\\Klip Plugins');

    await useConfigStore.getState().saveChanges();

    expect(configApi.set).toHaveBeenCalledWith('clipboard_monitor_enabled', 'false');
    expect(configApi.set).toHaveBeenCalledWith('updates_enabled', 'true');
    expect(configApi.set).toHaveBeenCalledWith(
      'update_feed_url',
      'https://updates.example.test/klip.json'
    );
    expect(configApi.set).toHaveBeenCalledWith('encryption_enabled', 'true');
    expect(configApi.set).toHaveBeenCalledWith('sync_folder', 'C:\\Klip Sync');
    expect(configApi.set).toHaveBeenCalledWith('plugin_folder', 'C:\\Klip Plugins');
  });

  it('does not persist the legacy tray visibility key as a runtime setting', async () => {
    vi.mocked(configApi.set).mockResolvedValue(undefined);

    await useConfigStore.getState().saveChanges();

    expect(configApi.set).not.toHaveBeenCalledWith('show_in_tray', expect.any(String));
  });
});
