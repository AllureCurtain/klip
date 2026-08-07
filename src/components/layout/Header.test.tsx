/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  monitorEnabled: true,
  privacyModeUntil: 0,
  setMonitorEnabled: vi.fn(),
  setPrivacyModeForMinutes: vi.fn(),
  resolvedTheme: 'light' as const,
  setTheme: vi.fn(),
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
  useProductivityStore: () => ({
    monitorEnabled: storeMocks.monitorEnabled,
    privacyModeUntil: storeMocks.privacyModeUntil,
    setMonitorEnabled: storeMocks.setMonitorEnabled,
    setPrivacyModeForMinutes: storeMocks.setPrivacyModeForMinutes,
  }),
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
    storeMocks.monitorEnabled = true;
    storeMocks.privacyModeUntil = 0;
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

    expect(screen.getByRole('button', { name: '更多操作' })).toBeTruthy();
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

    const searchInput = screen.getByRole('textbox', {
      name: '搜索剪贴板历史...',
    });

    expect(searchInput).toBeTruthy();
    expect(searchInput.getAttribute('data-clipboard-search-input')).toBe('true');
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

  it('uses a quiet neutral treatment for active content filters', () => {
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

    const activeFilter = screen.getByRole('button', { name: '全部' });

    expect(activeFilter.className).toContain('bg-primary/15');
    expect(activeFilter.className).toContain('text-primary');
    expect(activeFilter.className).not.toContain('hover:bg-[var(--glass-bg)]');
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

  it('keeps the more menu above the clipboard list layer', () => {
    const { container } = render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    const header = container.querySelector('header') as HTMLElement;
    expect(header.className).toContain('relative');
    expect(header.className).toContain('z-30');

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));

    const menu = screen.getByRole('region', { name: '更多操作' });
    expect(menu.className).toContain('z-40');
  });

  it('exposes pause monitoring and privacy mode actions in the more menu', () => {
    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '暂停监听' }));
    expect(storeMocks.setMonitorEnabled).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: '更多操作' }));
    fireEvent.click(screen.getByRole('button', { name: '隐私模式 15 分钟' }));
    expect(storeMocks.setPrivacyModeForMinutes).toHaveBeenCalledWith(15);
  });

  it('shows paused monitoring status in the header', () => {
    storeMocks.monitorEnabled = false;

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByText('监听已暂停')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    expect(storeMocks.setMonitorEnabled).toHaveBeenCalledWith(true);
  });

  it('shows active privacy mode in the header', () => {
    storeMocks.privacyModeUntil = Date.now() + 15 * 60_000;

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.getByText(/隐私模式剩余/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '结束' }));
    expect(storeMocks.setPrivacyModeForMinutes).toHaveBeenCalledWith(0);
  });

  it('exposes advanced search filters without crowding the default header', () => {
    const onAdvancedFiltersChange = vi.fn();

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        advancedFilters={{
          sensitiveOnly: null,
          exactMatch: false,
          createdAfter: null,
          createdBefore: null,
        }}
        onAdvancedFiltersChange={onAdvancedFiltersChange}
        onSettingsOpen={vi.fn()}
      />
    );

    expect(screen.queryByRole('switch', { name: '仅敏感内容' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '高级搜索' }));
    fireEvent.click(screen.getByRole('switch', { name: '仅敏感内容' }));
    expect(onAdvancedFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ sensitiveOnly: true })
    );

    fireEvent.click(screen.getByRole('switch', { name: '精确匹配' }));
    expect(onAdvancedFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ exactMatch: true })
    );

    fireEvent.change(screen.getByLabelText('开始日期'), {
      target: { value: '2026-05-01' },
    });
    expect(onAdvancedFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ createdAfter: new Date('2026-05-01T00:00:00').getTime() })
    );
  });

  it('renders advanced date filters as local calendar dates', () => {
    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode={false}
        onSelectionModeChange={vi.fn()}
        advancedFilters={{
          sensitiveOnly: null,
          exactMatch: false,
          createdAfter: new Date(2026, 4, 1, 0, 30).getTime(),
          createdBefore: null,
        }}
        onAdvancedFiltersChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '高级搜索' }));

    expect((screen.getByLabelText('开始日期') as HTMLInputElement).value).toBe(
      '2026-05-01'
    );
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
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

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
    expect(confirmSpy).toHaveBeenCalledWith('确定删除已选择的 1 项吗？');
    expect(storeMocks.deleteSelected).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清除选择' }));
    expect(storeMocks.clearSelection).toHaveBeenCalled();
  });

  it('does not delete selected items when batch deletion is cancelled', () => {
    storeMocks.selectedIds = [42, 43];
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <HeaderWithSelection
        searchQuery=""
        onSearchChange={vi.fn()}
        contentType={null}
        onContentTypeChange={vi.fn()}
        showFavorites={false}
        onShowFavoritesChange={vi.fn()}
        tags={[]}
        selectedTagId={null}
        onSelectedTagChange={vi.fn()}
        selectionMode
        onSelectionModeChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除已选' }));

    expect(window.confirm).toHaveBeenCalledWith('确定删除已选择的 2 项吗？');
    expect(storeMocks.deleteSelected).not.toHaveBeenCalled();
  });
});
