import { create } from 'zustand';
import { configApi } from '@/lib/tauri';
import type { ThemeFamily, ThemeMode } from '@/types';

type ResolvedThemeMode = 'light' | 'dark';

interface ThemeState {
  themeFamily: ThemeFamily;
  themeMode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  resolvedTheme: ResolvedThemeMode;
  setTheme: (mode: ThemeMode) => void;
  setThemeFamily: (family: ThemeFamily, persist?: boolean) => Promise<void>;
  setThemeMode: (mode: ThemeMode, persist?: boolean) => Promise<void>;
  hydrate: (config?: Record<string, string>) => Promise<void>;
}

const families: ThemeFamily[] = ['ember', 'graphite', 'brick', 'rose'];
const modes: ThemeMode[] = ['light', 'dark', 'system'];

function systemMode(): ResolvedThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function cachedFamily(): ThemeFamily {
  const value = localStorage.getItem('klip-theme-family');
  return value && families.includes(value as ThemeFamily) ? value as ThemeFamily : 'brick';
}

function cachedMode(): ThemeMode {
  const value = localStorage.getItem('klip-theme-mode');
  if (value && modes.includes(value as ThemeMode)) return value as ThemeMode;
  const legacy = localStorage.getItem('klip-theme');
  return legacy === 'dark' || legacy === 'light' ? legacy : 'system';
}

function applyTheme(family: ThemeFamily, mode: ThemeMode): ResolvedThemeMode {
  const resolved = mode === 'system' ? systemMode() : mode;
  const root = document.documentElement;
  root.dataset.theme = family;
  root.dataset.mode = resolved;
  root.classList.toggle('dark', resolved === 'dark');
  localStorage.setItem('klip-theme-family', family);
  localStorage.setItem('klip-theme-mode', mode);
  localStorage.setItem('klip-theme', resolved);
  return resolved;
}

const initialFamily = cachedFamily();
const initialMode = cachedMode();

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeFamily: initialFamily,
  themeMode: initialMode,
  resolvedMode: applyTheme(initialFamily, initialMode),
  resolvedTheme: initialMode === 'system' ? systemMode() : initialMode,
  setTheme: (mode) => { void get().setThemeMode(mode); },
  setThemeFamily: async (family, persist = true) => {
    const mode = get().themeMode;
    const resolvedMode = applyTheme(family, mode);
    set({ themeFamily: family, resolvedMode, resolvedTheme: resolvedMode });
    if (persist) await configApi.set('theme_family', family);
  },
  setThemeMode: async (mode, persist = true) => {
    const family = get().themeFamily;
    const resolvedMode = applyTheme(family, mode);
    set({ themeMode: mode, resolvedMode, resolvedTheme: resolvedMode });
    if (persist) await configApi.set('theme_mode', mode);
  },
  hydrate: async (config) => {
    const values = config ?? await configApi.getAll();
    const family = families.includes(values.theme_family as ThemeFamily) ? values.theme_family as ThemeFamily : 'brick';
    const mode = modes.includes(values.theme_mode as ThemeMode) ? values.theme_mode as ThemeMode : 'system';
    const resolvedMode = applyTheme(family, mode);
    set({ themeFamily: family, themeMode: mode, resolvedMode, resolvedTheme: resolvedMode });
  },
}));

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.themeMode === 'system') {
      const resolvedMode = applyTheme(state.themeFamily, 'system');
      useThemeStore.setState({ resolvedMode, resolvedTheme: resolvedMode });
    }
  });
}
