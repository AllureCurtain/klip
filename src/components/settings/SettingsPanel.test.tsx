/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel';

const storeMocks = vi.hoisted(() => ({
  fetchConfig: vi.fn(),
  fetchSystemInfo: vi.fn(),
  fetchDiagnosticsInfo: vi.fn(),
  setMaxHistoryCount: vi.fn(),
  setHotkeyToggleWindow: vi.fn(),
  setHotkeyQuickPastePrefix: vi.fn(),
  setAutoStart: vi.fn(),
  setCloseToTray: vi.fn(),
  setWindowWidth: vi.fn(),
  setWindowHeight: vi.fn(),
  setSearchDebounceMs: vi.fn(),
  saveChanges: vi.fn(),
  resetChanges: vi.fn(),
}));

vi.mock('@/stores/configStore', () => ({
  useConfigStore: () => ({
    config: {
      max_history_count: 100,
      hotkey_toggle_window: 'Ctrl+Alt+K',
      hotkey_quick_paste_prefix: 'Ctrl+Alt',
      auto_start: false,
      close_to_tray: true,
      show_in_tray: true,
      window_width: 480,
      window_height: 720,
      search_debounce_ms: 150,
    },
    systemInfo: {
      platform: 'windows',
      version: '0.1.0',
      app_version: '0.1.0',
    },
    diagnosticsInfo: {
      platform: 'windows',
      app_version: '0.1.0',
      data_dir: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app',
      db_path: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\klip.db',
      log_dir: 'C:\\Users\\tester\\AppData\\Roaming\\com.klip.app\\logs',
    },
    loading: false,
    error: null,
    hasChanges: true,
    ...storeMocks,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => (
    <button aria-pressed={checked} onClick={() => onCheckedChange(!checked)} />
  ),
}));

describe('SettingsPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('fetches and renders diagnostics fields in the about tab', () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="about" />);

    expect(storeMocks.fetchDiagnosticsInfo).toHaveBeenCalled();
    expect(screen.getByText('数据目录')).toBeTruthy();
    expect(screen.getByText('数据库')).toBeTruthy();
    expect(screen.getByText('日志目录')).toBeTruthy();
    expect(screen.getByText(/klip\.db$/)).toBeTruthy();
  });

  it('allows editing runtime hotkey settings', () => {
    render(<SettingsPanel open onOpenChange={vi.fn()} initialTab="shortcuts" />);

    fireEvent.change(screen.getByLabelText('切换窗口快捷键'), {
      target: { value: 'Ctrl+Alt+J' },
    });
    fireEvent.change(screen.getByLabelText('快速粘贴前缀'), {
      target: { value: 'Ctrl+Alt+Shift' },
    });

    expect(storeMocks.setHotkeyToggleWindow).toHaveBeenCalledWith('Ctrl+Alt+J');
    expect(storeMocks.setHotkeyQuickPastePrefix).toHaveBeenCalledWith('Ctrl+Alt+Shift');
  });
});
