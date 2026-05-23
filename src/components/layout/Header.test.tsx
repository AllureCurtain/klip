/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ComponentType } from 'react';
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

type HeaderWithSelectionProps = ComponentProps<typeof Header> & {
  selectionMode?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
};

const HeaderWithSelection = Header as ComponentType<HeaderWithSelectionProps>;

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

  it('labels the lightweight header actions for assistive technology', () => {
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
    expect(screen.getByRole('button', { name: '设置' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '仅显示收藏' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空历史' })).toBeNull();
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

  it('keeps batch and tag controls out of the lightweight header', () => {
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

    expect(screen.queryByText('已选择 1 项')).toBeNull();
    expect(screen.queryByRole('button', { name: '分配 Work' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
  });

  it('exposes pressed state for content filters', () => {
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
  });

  it('does not expose clear history as a default header action', () => {
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

    const clearHistoryButton = screen.queryByRole('button', { name: '清空历史' });

    expect(clearHistoryButton).toBeNull();
  });

  it('keeps heavy filters and destructive actions behind the more menu', () => {
    const onShowFavoritesChange = vi.fn();
    const onSelectedTagChange = vi.fn();
    const onSelectionModeChange = vi.fn();

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={onShowFavoritesChange}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={onSelectedTagChange}
        selectionMode={false}
        onSelectionModeChange={onSelectionModeChange}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();
    expect(screen.queryByRole('button', { name: '仅显示收藏' })).toBeNull();
    expect(screen.queryByRole('button', { name: '清空历史' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));

    fireEvent.click(screen.getByRole('button', { name: '仅显示收藏' }));
    expect(onShowFavoritesChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(onSelectedTagChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '选择模式' }));
    expect(onSelectionModeChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '清空历史' }));
    expect(screen.getByText('清空剪贴板历史')).toBeTruthy();
  });

  it('closes the more menu from escape and outside clicks', () => {
    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('button', { name: '选择模式' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    expect(screen.getByRole('button', { name: '选择模式' })).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();
  });

  it('closes the more menu after choosing menu actions', () => {
    const onShowFavoritesChange = vi.fn();
    const onSelectedTagChange = vi.fn();
    const onSelectionModeChange = vi.fn();

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={onShowFavoritesChange}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={onSelectedTagChange}
        selectionMode={false}
        onSelectionModeChange={onSelectionModeChange}
        onSettingsOpen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '仅显示收藏' }));
    expect(onShowFavoritesChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(onSelectedTagChange).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '选择模式' }));
    expect(onSelectionModeChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '清空历史' }));
    expect(screen.queryByRole('button', { name: '选择模式' })).toBeNull();
    expect(screen.getByText('清空剪贴板历史')).toBeTruthy();
  });

  it('disables batch actions until items are selected', () => {
    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByText('选择要批量处理的条目')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: '收藏已选' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '分配 Work' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '删除已选' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: '清除选择' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it('shows batch actions only after selection mode is enabled', () => {
    storeMocks.selectedIds = [42];

    const { rerender } = render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.queryByText('已选择 1 项')).toBeNull();
    expect(screen.queryByRole('button', { name: '分配 Work' })).toBeNull();

    rerender(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByText('已选择 1 项')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '收藏已选' }));
    expect(storeMocks.setFavoriteForSelected).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: '分配 Work' }));
    expect(storeMocks.assignTagToSelected).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: '删除已选' }));
    expect(storeMocks.deleteSelected).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清除选择' }));
    expect(storeMocks.clearSelection).toHaveBeenCalled();
  });
});
