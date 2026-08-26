import { create } from 'zustand';
import { configApi, systemApi } from '@/lib/tauri';
import type { AppConfig, DiagnosticsInfo, StorageUsage, SystemInfo, WindowState } from '@/types';
import { getErrorMessage } from '@/types';
import { DEFAULT_CONFIG, clampWindowHeight, clampWindowWidth, parseConfig, serializeConfig } from './configSchema';

/** Settings-page save lifecycle (spec §5.3). */
export type ConfigSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ConfigState {
  config: AppConfig;
  committedConfig: AppConfig;
  systemInfo: SystemInfo | null;
  diagnosticsInfo: DiagnosticsInfo | null;
  storageUsage: StorageUsage | null;
  storageUsageError: string | null;
  windowState: WindowState | null;
  /** Lifecycle of the "restore default window size" action. */
  windowResetState: 'idle' | 'pending' | 'done' | 'error';
  loading: boolean;
  /** Set when the initial config load failed; the page shows a retry surface. */
  loadError: string | null;
  error: string | null;
  hasChanges: boolean;
  saveState: ConfigSaveState;

  clearSaveState: () => void;
  fetchConfig: () => Promise<void>;
  fetchSystemInfo: () => Promise<void>;
  fetchDiagnosticsInfo: () => Promise<void>;
  fetchStorageUsage: () => Promise<void>;
  fetchWindowState: () => Promise<void>;
  resetWindowSize: () => Promise<void>;
  setMaxHistoryCount: (value: number) => void;
  setHotkeyToggleWindow: (value: string) => void;
  setHotkeyQuickPastePrefix: (value: string) => void;
  setAutoStart: (value: boolean) => Promise<void>;
  setCloseToTray: (value: boolean) => void;
  setHideOnFocusLoss: (value: boolean) => void;
  setHideAfterPaste: (value: boolean) => void;
  setShowWindowOnStartup: (value: boolean) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setWindowWidth: (value: number) => void;
  setWindowHeight: (value: number) => void;
  setSearchDebounceMs: (value: number) => void;
  setLanguage: (value: string) => void;
  setSensitiveCapturePolicy: (value: AppConfig['sensitive_capture_policy']) => void;
  setMaskSensitivePreviews: (value: boolean) => void;
  setClipboardMonitorEnabled: (value: boolean) => void;
  setPrivacyModeUntil: (value: number) => void;
  setUpdatesEnabled: (value: boolean) => void;
  setUpdateFeedUrl: (value: string) => void;
  setEncryptionEnabled: (value: boolean) => void;
  setSyncFolder: (value: string) => void;
  setPluginFolder: (value: string) => void;
  setThemeFamily: (value: AppConfig['theme_family']) => void;
  setThemeMode: (value: AppConfig['theme_mode']) => void;
  setImageBudgetBytes: (value: number) => void;
  saveChanges: () => Promise<boolean>;
  resetChanges: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: DEFAULT_CONFIG,
  committedConfig: DEFAULT_CONFIG,
  systemInfo: null,
  diagnosticsInfo: null,
  storageUsage: null,
  storageUsageError: null,
  windowState: null,
  windowResetState: 'idle',
  loading: false,
  loadError: null,
  error: null,
  hasChanges: false,
  saveState: 'idle',

  clearSaveState: () => set({ saveState: 'idle', error: null }),

  fetchConfig: async () => {
    set({ loading: true, error: null, loadError: null });
    try {
      const allConfig = await configApi.getAll();
      const config = parseConfig(allConfig);
      set({
        config,
        committedConfig: config,
        loading: false,
        hasChanges: false,
        saveState: 'idle',
      });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ error: message, loadError: message, loading: false });
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

  fetchStorageUsage: async () => {
    set({ storageUsageError: null });
    try {
      const storageUsage = await systemApi.getStorageUsage();
      set({ storageUsage });
    } catch (error) {
      set({ storageUsageError: getErrorMessage(error) });
    }
  },

  fetchWindowState: async () => {
    try {
      const windowState = await systemApi.getWindowState();
      set({ windowState });
    } catch (error) {
      // Non-fatal: the About panel simply reports no stored geometry.
      set({ windowState: null, error: getErrorMessage(error) });
    }
  },

  /**
   * Immediate side effect, not a draft edit: `window_state` is runtime geometry
   * owned by the backend, so it is reset now and the draft's width/height are
   * realigned to the packaged defaults to keep the two in sync.
   */
  resetWindowSize: async () => {
    set({ windowResetState: 'pending', error: null });
    try {
      const windowState = await systemApi.resetWindowState();
      set((state) => ({
        windowState,
        windowResetState: 'done',
        config: {
          ...state.config,
          window_width: windowState.widthDip,
          window_height: windowState.heightDip,
        },
        committedConfig: {
          ...state.committedConfig,
          window_width: windowState.widthDip,
          window_height: windowState.heightDip,
        },
      }));
    } catch (error) {
      set({ windowResetState: 'error', error: getErrorMessage(error) });
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

  setHideOnFocusLoss: (value) => set((state) => ({ config: { ...state.config, hide_on_focus_loss: value }, hasChanges: true })),
  setHideAfterPaste: (value) => set((state) => ({ config: { ...state.config, hide_after_paste: value }, hasChanges: true })),
  setShowWindowOnStartup: (value) => set((state) => ({ config: { ...state.config, show_window_on_startup: value }, hasChanges: true })),
  setAlwaysOnTop: (value) => set((state) => ({ config: { ...state.config, always_on_top: value }, hasChanges: true })),

  setWindowWidth: (value) => {
    set((state) => ({
      config: { ...state.config, window_width: clampWindowWidth(value) },
      hasChanges: true,
    }));
  },

  setWindowHeight: (value) => {
    set((state) => ({
      config: { ...state.config, window_height: clampWindowHeight(value) },
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

  setSensitiveCapturePolicy: (value) => {
    set((state) => ({
      config: { ...state.config, sensitive_capture_policy: value },
      hasChanges: true,
    }));
  },

  setMaskSensitivePreviews: (value) => {
    set((state) => ({
      config: { ...state.config, mask_sensitive_previews: value },
      hasChanges: true,
    }));
  },

  setClipboardMonitorEnabled: (value) => {
    set((state) => ({
      config: { ...state.config, clipboard_monitor_enabled: value },
      hasChanges: true,
    }));
  },

  setPrivacyModeUntil: (value) => {
    set((state) => ({
      config: { ...state.config, privacy_mode_until: value },
      hasChanges: true,
    }));
  },

  setUpdatesEnabled: (value) => {
    set((state) => ({
      config: { ...state.config, updates_enabled: value },
      hasChanges: true,
    }));
  },

  setUpdateFeedUrl: (value) => {
    set((state) => ({
      config: { ...state.config, update_feed_url: value },
      hasChanges: true,
    }));
  },

  setEncryptionEnabled: (value) => {
    set((state) => ({
      config: {
        ...state.config,
        encryption_enabled: value,
        encryption_status: value ? 'configured' : 'off',
      },
      hasChanges: true,
    }));
  },

  setSyncFolder: (value) => {
    set((state) => ({
      config: { ...state.config, sync_folder: value },
      hasChanges: true,
    }));
  },

  setPluginFolder: (value) => {
    set((state) => ({
      config: { ...state.config, plugin_folder: value },
      hasChanges: true,
    }));
  },

  setThemeFamily: (value) => set((state) => ({ config: { ...state.config, theme_family: value }, hasChanges: true })),
  setThemeMode: (value) => set((state) => ({ config: { ...state.config, theme_mode: value }, hasChanges: true })),
  setImageBudgetBytes: (value) => set((state) => ({ config: { ...state.config, image_budget_bytes: value }, hasChanges: true })),

  saveChanges: async () => {
    const { config } = get();
    set({ loading: true, error: null, saveState: 'saving' });
    try {
      await configApi.setMany(
        serializeConfig(config).filter(([key]) => key !== 'auto_start')
      );
      set({ committedConfig: config, loading: false, hasChanges: false, saveState: 'saved' });
      return true;
    } catch (error) {
      // Draft is deliberately preserved: the DB and runtime keep the old values,
      // so discarding the user's edits here would lose work for no benefit.
      set({ error: getErrorMessage(error), loading: false, saveState: 'error' });
      return false;
    }
  },

  resetChanges: async () => {
    set((state) => ({
      config: state.committedConfig,
      hasChanges: false,
      error: null,
      saveState: 'idle',
    }));
  },
}));
