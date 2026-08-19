/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  set: vi.fn(),
  dark: false,
}));

vi.mock('@/lib/tauri', () => ({
  configApi: {
    getAll: mocks.getAll,
    set: mocks.set,
  },
}));

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn(() => ({
    get matches() {
      return mocks.dark;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});

import { useThemeStore } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.dark = false;
    mocks.getAll.mockReset();
    mocks.set.mockReset().mockResolvedValue(undefined);
  });

  it('hydrates the persisted family and resolves system mode without rewriting it', async () => {
    mocks.dark = true;
    mocks.getAll.mockResolvedValue({ theme_family: 'graphite', theme_mode: 'system' });

    await useThemeStore.getState().hydrate();

    const state = useThemeStore.getState();
    expect(state.themeFamily).toBe('graphite');
    expect(state.themeMode).toBe('system');
    expect(state.resolvedMode).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('graphite');
    expect(document.documentElement.dataset.mode).toBe('dark');
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('persists named family and explicit mode selections to SQLite', async () => {
    await useThemeStore.getState().setThemeFamily('rose');
    await useThemeStore.getState().setThemeMode('light');

    expect(mocks.set).toHaveBeenNthCalledWith(1, 'theme_family', 'rose');
    expect(mocks.set).toHaveBeenNthCalledWith(2, 'theme_mode', 'light');
    expect(document.documentElement.dataset.theme).toBe('rose');
    expect(document.documentElement.dataset.mode).toBe('light');
  });

  it('falls back to the documented defaults for invalid persisted values', async () => {
    await useThemeStore.getState().hydrate({ theme_family: 'violet', theme_mode: 'auto' });

    expect(useThemeStore.getState().themeFamily).toBe('brick');
    expect(useThemeStore.getState().themeMode).toBe('system');
  });
});
