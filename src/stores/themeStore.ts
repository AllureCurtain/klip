import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
const VALID_THEMES: Theme[] = ['light', 'dark', 'system'];

interface ThemeState {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  localStorage.setItem('klip-theme', resolved);
}

function validateTheme(raw: string | null): Theme {
  if (raw && (VALID_THEMES as string[]).includes(raw)) return raw as Theme;
  return 'system';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: validateTheme(localStorage.getItem('klip-theme-mode')),
  resolvedTheme: 'light',
  setTheme: (theme) => {
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    applyTheme(resolved);
    localStorage.setItem('klip-theme-mode', theme);
    set({ theme, resolvedTheme: resolved });
  },
}));

// Initialize on import
const initial = useThemeStore.getState();
const resolved = initial.theme === 'system' ? getSystemTheme() : initial.theme;
applyTheme(resolved);
useThemeStore.setState({ resolvedTheme: resolved });

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const state = useThemeStore.getState();
  if (state.theme === 'system') {
    const newResolved = e.matches ? 'dark' : 'light';
    applyTheme(newResolved);
    useThemeStore.setState({ resolvedTheme: newResolved });
  }
});
