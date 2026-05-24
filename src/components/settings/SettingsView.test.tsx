/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';
import { useConfigStore } from '@/stores/configStore';

const apiMocks = vi.hoisted(() => ({
  configGetAll: vi.fn(),
  systemGetInfo: vi.fn(),
  systemGetDiagnostics: vi.fn(),
  configSet: vi.fn(),
}));

const callbacks = vi.hoisted(() => ({
  onBack: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  configApi: {
    getAll: apiMocks.configGetAll,
    set: apiMocks.configSet,
  },
  systemApi: {
    getInfo: apiMocks.systemGetInfo,
    getDiagnostics: apiMocks.systemGetDiagnostics,
    setAutoStart: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      const dict: Record<string, string> = {
        'settings.tabs.general': 'General',
        'settings.tabs.shortcuts': 'Shortcuts',
        'settings.tabs.behavior': 'Behavior',
        'settings.tabs.data': 'Data',
        'settings.tabs.about': 'About',
        'settings.back': 'Back',
        'settings.title': 'Settings',
        'settings.about.version': 'Version',
        'settings.about.platform': 'Platform',
        'settings.about.system': 'System',
        'settings.about.dataDir': 'Data directory',
        'settings.about.database': 'Database',
        'settings.about.logDir': 'Log directory',
        'settings.about.tagline': 'Cross-platform clipboard manager',
        'settings.shortcuts.toggleWindow': 'Toggle window',
        'settings.shortcuts.toggleWindowHint': 'Supports Ctrl+Alt+A through Ctrl+Alt+Z',
        'settings.shortcuts.quickPastePrefix': 'Quick paste prefix',
        'settings.shortcuts.quickPasteHint': 'Prefix + number key to quick-paste',
        'settings.general.historyCount': 'History size',
        'settings.general.maxItems': 'Max items',
        'settings.general.windowSize': 'Window size',
        'settings.general.windowWidth': 'Window width',
        'settings.general.windowHeight': 'Window height',
        'settings.general.searchDebounce': 'Search debounce',
        'settings.general.milliseconds': 'ms',
        'settings.general.language': 'Language',
        'settings.general.languageHint': 'Display language for the UI',
        'settings.behavior.autoStart': 'Launch at startup',
        'settings.behavior.autoStartDesc': 'Run automatically when the system starts',
        'settings.behavior.closeToTray': 'Close to tray',
        'settings.behavior.closeToTrayDesc': 'Hide instead of quitting on close',
        'settings.data.tags': 'Tags and groups',
        'settings.data.skipSensitive': 'Skip sensitive clipboard content',
        'settings.data.skipSensitiveDesc': 'Do not save history when passwords, keys, or high-entropy tokens are detected',
        'settings.data.maskSensitivePreviews': 'Hide sensitive previews',
        'settings.data.maskSensitivePreviewsDesc': 'Show a masked placeholder for history items marked as sensitive',
        'settings.data.tagName': 'Tag name',
        'settings.data.tagColor': 'Tag color',
        'settings.data.deleteTag': 'Delete {{name}}',
        'settings.data.json': 'JSON import/export path',
        'settings.data.csv': 'CSV import/export path',
        'settings.data.backup': 'Database backup path',
        'settings.data.chooseExportPath': 'Save to...',
        'settings.data.chooseImportPath': 'Choose file...',
        'settings.data.chooseBackupPath': 'Back up to...',
        'settings.data.chooseRestorePath': 'Choose backup...',
        'settings.data.export': 'Export',
        'settings.data.import': 'Import',
        'settings.data.backupNow': 'Backup',
        'settings.data.restore': 'Restore',
        'settings.data.exported': 'Export completed',
        'settings.data.imported': 'Import completed',
        'settings.data.backedUp': 'Backup completed',
        'settings.data.restored': 'Restore completed',
        'settings.data.restoreConfirm': 'Restore this database backup? The current database will be saved as a pre-restore backup first.',
        'settings.data.restoredWithBackup': 'Restore completed',
        'settings.data.rescanSensitive': 'Rescan sensitive content',
        'settings.data.sensitiveScanned': 'Sensitive content scan completed',
        'settings.save': 'Save',
        'settings.cancel': 'Cancel',
        'language.zh-CN': 'Simplified Chinese',
        'language.en-US': 'English',
      };
      const label = dict[key] ?? key;
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
    apiMocks.configGetAll.mockResolvedValue({});
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

  it('updates hotkey setters when shortcuts inputs change', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    fireEvent.change(screen.getByLabelText('Toggle window'), {
      target: { value: 'Ctrl+Alt+Z' },
    });
    fireEvent.change(screen.getByLabelText('Quick paste prefix'), {
      target: { value: 'Ctrl+Shift' },
    });

    expect(useConfigStore.getState().config.hotkey_toggle_window).toBe('Ctrl+Alt+Z');
    expect(useConfigStore.getState().config.hotkey_quick_paste_prefix).toBe('Ctrl+Shift');
  });

  it('saves edits through the store when save is clicked', async () => {
    apiMocks.configSet.mockResolvedValue(undefined);

    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    fireEvent.change(screen.getByLabelText('Toggle window'), {
      target: { value: 'Ctrl+Alt+Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.configSet).toHaveBeenCalledWith('hotkey_toggle_window', 'Ctrl+Alt+Z');
    expect(apiMocks.configSet).toHaveBeenCalledWith('hotkey_quick_paste_prefix', 'Ctrl+Alt');
    expect(callbacks.onBack).toHaveBeenCalled();
  });

  it('keeps settings open and shows the save error when saving fails', async () => {
    apiMocks.configSet.mockRejectedValue(new Error('Invalid hotkey'));

    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    fireEvent.change(screen.getByLabelText('Toggle window'), {
      target: { value: 'Ctrl+Alt+?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callbacks.onBack).not.toHaveBeenCalled();
    expect(screen.getByText('Invalid hotkey')).toBeTruthy();
  });

  it('uses the packaged window minimums for size inputs', async () => {
    render(<SettingsView onBack={callbacks.onBack} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Window width').getAttribute('min')).toBe('360');
    expect(screen.getByLabelText('Window height').getAttribute('min')).toBe('480');
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

    expect(screen.getByLabelText('History size')).toBeTruthy();
    expect(screen.getByLabelText('Window width')).toBeTruthy();
    expect(screen.getByLabelText('Window height')).toBeTruthy();
    expect(screen.getByLabelText('Search debounce')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Behavior' }));

    expect(screen.getByRole('switch', { name: 'Launch at startup' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Close to tray' })).toBeTruthy();
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
});
