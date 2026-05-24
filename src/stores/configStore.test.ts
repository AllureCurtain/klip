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
  show_in_tray: true,
  window_width: 560,
  window_height: 760,
  search_debounce_ms: 150,
  language: 'zh-CN',
  sensitive_capture_policy: 'flag',
  mask_sensitive_previews: true,
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

  it('persists sensitive preview masking with other config changes', async () => {
    useConfigStore.getState().setMaskSensitivePreviews(false);
    vi.mocked(configApi.set).mockResolvedValue(undefined);

    await useConfigStore.getState().saveChanges();

    expect(configApi.set).toHaveBeenCalledWith('mask_sensitive_previews', 'false');
  });
});
