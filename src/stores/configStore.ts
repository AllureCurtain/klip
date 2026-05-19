import { create } from 'zustand';
import { configApi, systemApi } from '@/lib/tauri';
import type { AppConfig, DiagnosticsInfo, SystemInfo } from '@/types';
import { getErrorMessage } from '@/types';

function parseBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) return defaultValue;
  return value === 'true';
}

function parseNumber(value: string | null, defaultValue: number): number {
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

interface ConfigState {
  config: AppConfig;
  systemInfo: SystemInfo | null;
  diagnosticsInfo: DiagnosticsInfo | null;
  loading: boolean;
  error: string | null;
  hasChanges: boolean;

  fetchConfig: () => Promise<void>;
  fetchSystemInfo: () => Promise<void>;
  fetchDiagnosticsInfo: () => Promise<void>;
  setMaxHistoryCount: (value: number) => void;
  setHotkeyToggleWindow: (value: string) => void;
  setHotkeyQuickPastePrefix: (value: string) => void;
  setAutoStart: (value: boolean) => Promise<void>;
  setCloseToTray: (value: boolean) => void;
  setShowInTray: (value: boolean) => void;
  setWindowWidth: (value: number) => void;
  setWindowHeight: (value: number) => void;
  setSearchDebounceMs: (value: number) => void;
  setLanguage: (value: string) => void;
  saveChanges: () => Promise<void>;
  resetChanges: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  max_history_count: 100,
  hotkey_toggle_window: 'Ctrl+Alt+K',
  hotkey_quick_paste_prefix: 'Ctrl+Alt',
  auto_start: false,
  close_to_tray: true,
  show_in_tray: true,
  window_width: 480,
  window_height: 720,
  search_debounce_ms: 150,
  language: 'zh-CN',
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  systemInfo: null,
  diagnosticsInfo: null,
  loading: false,
  error: null,
  hasChanges: false,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const allConfig = await configApi.getAll();
      const config: AppConfig = {
        max_history_count: parseNumber(allConfig['max_history_count'], 100),
        hotkey_toggle_window: allConfig['hotkey_toggle_window'] || 'Ctrl+Alt+K',
        hotkey_quick_paste_prefix: allConfig['hotkey_quick_paste_prefix'] || 'Ctrl+Alt',
        auto_start: parseBoolean(allConfig['auto_start'], false),
        close_to_tray: parseBoolean(allConfig['close_to_tray'], true),
        show_in_tray: parseBoolean(allConfig['show_in_tray'], true),
        window_width: parseNumber(allConfig['window_width'], 480),
        window_height: parseNumber(allConfig['window_height'], 720),
        search_debounce_ms: parseNumber(allConfig['search_debounce_ms'], 150),
        language: allConfig['language'] || 'zh-CN',
      };
      set({ config, loading: false, hasChanges: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  fetchSystemInfo: async () => {
    try {
      const systemInfo = await systemApi.getInfo();
      set({ systemInfo });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  fetchDiagnosticsInfo: async () => {
    try {
      const diagnosticsInfo = await systemApi.getDiagnostics();
      set({ diagnosticsInfo });
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  setMaxHistoryCount: (value) => {
    set((state) => ({
      config: { ...state.config, max_history_count: value },
      hasChanges: true,
    }));
  },

  setHotkeyToggleWindow: (value) => {
    set((state) => ({
      config: { ...state.config, hotkey_toggle_window: value },
      hasChanges: true,
    }));
  },

  setHotkeyQuickPastePrefix: (value) => {
    set((state) => ({
      config: { ...state.config, hotkey_quick_paste_prefix: value },
      hasChanges: true,
    }));
  },

  setAutoStart: async (value) => {
    try {
      await systemApi.setAutoStart(value);
      set((state) => ({
        config: { ...state.config, auto_start: value },
      }));
    } catch (error) {
      set({ error: getErrorMessage(error) });
    }
  },

  setCloseToTray: (value) => {
    set((state) => ({
      config: { ...state.config, close_to_tray: value },
      hasChanges: true,
    }));
  },

  setShowInTray: (value) => {
    set((state) => ({
      config: { ...state.config, show_in_tray: value },
      hasChanges: true,
    }));
  },

  setWindowWidth: (value) => {
    set((state) => ({
      config: { ...state.config, window_width: value },
      hasChanges: true,
    }));
  },

  setWindowHeight: (value) => {
    set((state) => ({
      config: { ...state.config, window_height: value },
      hasChanges: true,
    }));
  },

  setSearchDebounceMs: (value) => {
    set((state) => ({
      config: { ...state.config, search_debounce_ms: value },
      hasChanges: true,
    }));
  },

  setLanguage: (value) => {
    set((state) => ({
      config: { ...state.config, language: value },
      hasChanges: true,
    }));
  },

  saveChanges: async () => {
    const { config } = get();
    set({ loading: true, error: null });
    try {
      await configApi.set('max_history_count', config.max_history_count.toString());
      await configApi.set('hotkey_toggle_window', config.hotkey_toggle_window);
      await configApi.set('hotkey_quick_paste_prefix', config.hotkey_quick_paste_prefix);
      await configApi.set('close_to_tray', config.close_to_tray.toString());
      await configApi.set('show_in_tray', config.show_in_tray.toString());
      await configApi.set('window_width', config.window_width.toString());
      await configApi.set('window_height', config.window_height.toString());
      await configApi.set('search_debounce_ms', config.search_debounce_ms.toString());
      await configApi.set('language', config.language);
      set({ loading: false, hasChanges: false });
    } catch (error) {
      set({ error: getErrorMessage(error), loading: false });
    }
  },

  resetChanges: async () => {
    await get().fetchConfig();
  },
}));
