/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';
import { useConfigStore } from '@/stores/configStore';
import { useShortcutStore } from '@/stores/shortcutStore';

const apiMocks = vi.hoisted(() => ({
  configGetAll: vi.fn(),
  systemGetInfo: vi.fn(),
  systemGetDiagnostics: vi.fn(),
  configSet: vi.fn(),
  configSetMany: vi.fn(),
  shortcutGet: vi.fn(),
  shortcutSet: vi.fn(),
}));

const shellMocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

const callbacks = vi.hoisted(() => ({
  onBack: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  configApi: {
    getAll: apiMocks.configGetAll,
    set: apiMocks.configSet,
    setMany: apiMocks.configSetMany,
  },
  systemApi: {
    getInfo: apiMocks.systemGetInfo,
    getDiagnostics: apiMocks.systemGetDiagnostics,
    setAutoStart: vi.fn(),
    beginFocusLossSuppression: vi.fn().mockResolvedValue(undefined),
    endFocusLossSuppression: vi.fn().mockResolvedValue(undefined),
  },
  shortcutApi: {
    getBindings: apiMocks.shortcutGet,
    setBindings: apiMocks.shortcutSet,
  },
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: shellMocks.open,
}));

/**
 * Translate against the real en-US bundle rather than a hand-copied dictionary.
 * A local copy silently rots whenever a panel is reworded, and these tests assert
 * on user-visible labels — so they must read the strings the user actually sees.
 * Hoisted because SettingsView pulls in react-i18next before this module's body runs.
 */
const enMessages = vi.hoisted(() => {
  // Relative, not the `@/` alias: `require` runs outside Vite's resolver.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bundle = require('../../i18n/locales/en-US.json') as Record<string, unknown>;
  const flatten = (
    source: Record<string, unknown>,
    prefix = '',
    out: Record<string, string> = {}
  ): Record<string, string> => {
    for (const [key, value] of Object.entries(source)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object') {
        flatten(value as Record<string, unknown>, path, out);
      } else {
        out[path] = String(value);
      }
    }
    return out;
  };
  return flatten(bundle);
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      // Mirror i18next plural resolution: `key_one` / `key_other` win over `key`.
      const plural =
        vars?.count !== undefined
          ? enMessages[`${key}_${vars.count === 1 ? 'one' : 'other'}`]
          : undefined;
      const label = plural ?? enMessages[key] ?? key;
      return vars
        ? label.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(vars[name] ?? ''))
        : label;
    },
  }),
}));

vi.mock('./DataManagementView', () => ({
  DataManagementView: () => <div>Data management</div>,
}));

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigStore.setState((state) => ({
      ...state,
      config: {
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
      },
      systemInfo: {
        platform: 'windows',
        version: '10.0',
        app_version: '0.1.2',
      },
      diagnosticsInfo: null,
      loading: false,
      error: null,
      hasChanges: false,
    }));
    // A size that is neither the packaged default nor the minimum, so assertions
    // on the General panel's three size rows stay unambiguous.
    apiMocks.configGetAll.mockResolvedValue({ window_width: '720', window_height: '640' });
    apiMocks.shortcutGet.mockResolvedValue([
      { actionId: 'toggle_window', enabled: true, accelerator: 'Ctrl+Alt+K', updatedAt: 1 },
      ...Array.from({ length: 9 }, (_, index) => ({
        actionId: `quick_paste_${index + 1}`,
        enabled: false,
        accelerator: `Ctrl+Alt+${index + 1}`,
        updatedAt: 1,
      })),
    ]);
    apiMocks.shortcutSet.mockResolvedValue(undefined);
    useShortcutStore.setState({ bindings: [], committed: [], error: null, loading: false, saving: false, captureAction: null, isDirty: false });
    apiMocks.systemGetInfo.mockResolvedValue({
      platform: 'windows',
      version: '10.0',
      app_version: '0.1.2',
    });
    apiMocks.systemGetDiagnostics.mockResolvedValue({
      platform: 'windows',
      app_version: '0.1.2',
      data_dir: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app',
      db_path: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\klip.db',
      log_dir: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\logs',
    });
    shellMocks.open.mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders diagnostics in About', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByText('Data directory')).toBeTruthy();
    expect(screen.getByText('Database')).toBeTruthy();
    expect(screen.getByText('Log directory')).toBeTruthy();
    expect(
      screen.getByText('C:\\Users\\tester\\AppData\\Roaming\\com.klip.app')
    ).toBeTruthy();
    expect(
      screen.getByText('C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\klip.db')
    ).toBeTruthy();
    expect(
      screen.getByText('C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\logs')
    ).toBeTruthy();
    expect(apiMocks.systemGetDiagnostics).toHaveBeenCalled();
  });

  it('records an independent shortcut from KeyboardEvent.code', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const recorder = screen.getByRole('button', { name: 'Show / hide Klip' });
    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { code: 'KeyZ', key: 'z', ctrlKey: true, altKey: true });

    expect(useShortcutStore.getState().bindings[0].accelerator).toBe('Ctrl+Alt+Z');
    expect(useShortcutStore.getState().isDirty).toBe(true);
  });

  it('saves edits through the store when save is clicked', async () => {
    apiMocks.configSetMany.mockResolvedValue(undefined);

    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    const recorder = screen.getByRole('button', { name: 'Show / hide Klip' });
    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { code: 'KeyZ', key: 'z', ctrlKey: true, altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.shortcutSet).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ actionId: 'toggle_window', accelerator: 'Ctrl+Alt+Z' })])
    );
    expect(apiMocks.configSetMany.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([expect.arrayContaining(['hotkey_toggle_window'])])
    );
    expect(apiMocks.configSet).not.toHaveBeenCalled();
    // §5.2: a successful save stays on the settings page, reports success, and
    // clears the dirty flag. Navigating away is the user's separate decision.
    expect(callbacks.onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(useShortcutStore.getState().isDirty).toBe(false);
  });

  it('keeps settings open and shows the save error when saving fails', async () => {
    apiMocks.shortcutSet.mockRejectedValue(new Error('Shortcut is occupied by another program'));

    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    const recorder = screen.getByRole('button', { name: 'Show / hide Klip' });
    fireEvent.click(recorder);
    fireEvent.keyDown(recorder, { code: 'KeyZ', key: 'z', ctrlKey: true, altKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callbacks.onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Shortcut is occupied by another program')).toBeTruthy();
  });

  it('reports window sizes as read-only info instead of pixel inputs', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    // §3.3: sizing is drag-to-resize. The panel reports the packaged default and
    // minimum plus the live size, and offers a reset — it never asks for pixels.
    expect(screen.getByText('680 × 720 DIP')).toBeTruthy();
    expect(screen.getByText('360 × 480 DIP')).toBeTruthy();
    expect(screen.getByText('720 × 640 DIP')).toBeTruthy();
    expect(screen.queryByLabelText('Window width')).toBeNull();
    expect(screen.queryByLabelText('Window height')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset size' })).toBeTruthy();
  });

  it('opens the requested initial tab', async () => {
    render(<SettingsView onBack={callbacks.onBack} initialTab="about" />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('tab', { name: 'About', selected: true })).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'About' })).toBeTruthy();
  });

  it('updates the active tab when the requested tab changes', async () => {
    const { rerender } = render(
      <SettingsView onBack={callbacks.onBack} initialTab="general" />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('tab', { name: 'General', selected: true })).toBeTruthy();

    rerender(<SettingsView onBack={callbacks.onBack} initialTab="about" />);

    expect(screen.getByRole('tab', { name: 'About', selected: true })).toBeTruthy();
  });

  it('labels general and behavior controls for assistive technology', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    // §10.2 splits these across panels: startup lives in General, window and
    // paste behavior in Behavior. Each control keeps an accessible name.
    expect(screen.getByLabelText('History size')).toBeTruthy();
    expect(screen.getByLabelText('Search debounce')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Launch at startup' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Behavior' }));

    expect(screen.getByRole('switch', { name: 'Close to tray' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Hide when focus is lost' })).toBeTruthy();
  });

  it('uses the ten-action recorder without legacy shortcut selectors', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    expect(screen.getAllByRole('switch')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Show / hide Klip' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paste visible item 9' })).toBeTruthy();
    expect(screen.queryByLabelText('Toggle window')).toBeNull();
    expect(screen.queryByLabelText('Quick paste prefix')).toBeNull();
  });

  it('exposes settings navigation as tabs for assistive technology', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('tablist', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'General', selected: true })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'About' }));

    expect(screen.getByRole('tab', { name: 'About', selected: true })).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'About' })).toBeTruthy();
  });

  it('copies and opens diagnostics paths from About', async () => {
    render(<SettingsView onBack={callbacks.onBack} initialTab="about" />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy Database' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Log directory' }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\klip.db'
    );
    expect(shellMocks.open).toHaveBeenCalledWith(
      'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\logs'
    );
  });
});
