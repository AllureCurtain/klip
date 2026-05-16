/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const storeMocks = vi.hoisted(() => ({
  clearItems: vi.fn(),
  resolvedTheme: 'light' as const,
  setTheme: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  openSettings: undefined as undefined | (() => void),
  openAbout: undefined as undefined | (() => void),
  onOpenSettings: vi.fn((callback: () => void) => {
    eventMocks.openSettings = callback;
    return Promise.resolve(vi.fn());
  }),
  onOpenAbout: vi.fn((callback: () => void) => {
    eventMocks.openAbout = callback;
    return Promise.resolve(vi.fn());
  }),
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => ({ clearItems: storeMocks.clearItems }),
  useThemeStore: () => ({
    resolvedTheme: storeMocks.resolvedTheme,
    setTheme: storeMocks.setTheme,
  }),
}));

vi.mock('@/lib/tauri', () => ({
  onOpenSettings: eventMocks.onOpenSettings,
  onOpenAbout: eventMocks.onOpenAbout,
}));

describe('Header', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    eventMocks.openSettings = undefined;
    eventMocks.openAbout = undefined;
  });

  it('focuses the search input on render', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(
      screen.getByPlaceholderText('搜索剪贴板历史...')
    );
  });

  it('calls onSettingsOpen from the tray settings event', () => {
    const onSettingsOpen = vi.fn();
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        onSettingsOpen={onSettingsOpen}
      />
    );

    act(() => eventMocks.openSettings?.());

    expect(onSettingsOpen).toHaveBeenCalled();
  });

  it('calls onSettingsOpen from the tray about event', () => {
    const onSettingsOpen = vi.fn();
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        onSettingsOpen={onSettingsOpen}
      />
    );

    act(() => eventMocks.openAbout?.());

    expect(onSettingsOpen).toHaveBeenCalled();
  });
});
