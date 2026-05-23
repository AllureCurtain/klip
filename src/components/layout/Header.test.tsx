/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';

const storeMocks = vi.hoisted(() => ({
  clearItems: vi.fn(),
  selectedIds: [] as number[],
  clearSelection: vi.fn(),
  deleteSelected: vi.fn(),
  assignTagToSelected: vi.fn(),
  setFavoriteForSelected: vi.fn(),
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
  useClipboardStore: () => ({
    clearItems: storeMocks.clearItems,
    selectedIds: storeMocks.selectedIds,
    clearSelection: storeMocks.clearSelection,
    deleteSelected: storeMocks.deleteSelected,
    assignTagToSelected: storeMocks.assignTagToSelected,
    setFavoriteForSelected: storeMocks.setFavoriteForSelected,
  }),
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
    storeMocks.selectedIds = [];
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
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
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
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
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
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={onSettingsOpen}
      />
    );

    act(() => eventMocks.openAbout?.());

    expect(onSettingsOpen).toHaveBeenCalled();
  });

  it('labels icon-only actions for assistive technology', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '切换主题' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '仅显示收藏' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '清空历史' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
  });

  it('labels the search input for assistive technology', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(
      screen.getByRole('textbox', { name: '搜索剪贴板历史...' })
    ).toBeTruthy();
  });

  it('labels selected-item tag assignment actions for assistive technology', () => {
    storeMocks.selectedIds = [42];

    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '分配 Work' })).toBeTruthy();
  });

  it('exposes pressed state for favorites, content, and tag filters', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType="image"
        onContentTypeChange={vi.fn()}
        showFavorites
        onShowFavoritesChange={vi.fn()}
        tags={[
          { id: 1, name: 'Work', color: '#2563eb', created_at: 0 },
          { id: 2, name: 'Personal', color: '#16a34a', created_at: 0 },
        ]}
        selectedTagId={2}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(
      screen
        .getByRole('button', { name: '仅显示收藏' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '全部' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '文本' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '图片' }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: '文件' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: '全部标签' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Work' }).getAttribute('aria-pressed')
    ).toBe('false');
    expect(
      screen.getByRole('button', { name: 'Personal' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('labels the clear-history dialog close action with the active language', () => {
    render(
      <Header
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    act(() => {
      screen.getByRole('button', { name: '清空历史' }).click();
    });

    expect(screen.getByRole('button', { name: '关闭' })).toBeTruthy();
  });
});
