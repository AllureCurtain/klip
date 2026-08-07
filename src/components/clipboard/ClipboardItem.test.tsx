/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardItem } from './ClipboardItem';
import type { ClipboardItem as ClipboardItemType } from '@/types';
import { useConfigStore } from '@/stores/configStore';

const storeMocks = vi.hoisted(() => ({
  deleteItem: vi.fn(),
  copyItem: vi.fn(),
  pasteItem: vi.fn(),
  copyItemPlainText: vi.fn(),
  pasteItemPlainText: vi.fn(),
  toggleFavorite: vi.fn(),
  tags: [] as { id: number; name: string; color: string | null; created_at: number }[],
  assignTagToItem: vi.fn(),
  removeTagFromItem: vi.fn(),
  selectedIds: [] as number[],
  toggleSelected: vi.fn(),
}));

const contentActionMocks = vi.hoisted(() => ({
  actions: [] as import('@/types').ClipboardContentAction[],
  executeAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
}));

vi.mock('./useClipboardContentActions', () => ({
  useClipboardContentActions: (_itemId: number, enabled: boolean) =>
    enabled
      ? contentActionMocks
      : { ...contentActionMocks, actions: [] },
}));

type ClipboardItemWithSelectionProps = ComponentProps<typeof ClipboardItem> & {
  selectionMode?: boolean;
};

const ClipboardItemWithSelection = ClipboardItem as ComponentType<ClipboardItemWithSelectionProps>;

function makeTextItem(overrides: Partial<ClipboardItemType> = {}): ClipboardItemType {
  return {
    id: 42,
    content_type: 'text',
    content: 'hello',
    preview: 'hello',
    hash: 'hash-42',
    size: 5,
    metadata: null,
    source_application: null,
    source_window_title: null,
    custom_title: null,
    note: null,
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
    formats: [],
    ocr: null,
    tags: [],
    created_at: 1_714_000_000_000,
    last_used_at: 1_714_000_000_000,
    ...overrides,
  };
}

function makeImageItem(overrides: Partial<ClipboardItemType> = {}): ClipboardItemType {
  return {
    ...makeTextItem(),
    id: 84,
    content_type: 'image',
    content: 'data:image/png;base64,iVBORw0KGgo=',
    preview: 'Image 24x24',
    size: 12,
    metadata: JSON.stringify({
      width: 24,
      height: 24,
      format: 'png',
    }),
    ...overrides,
  };
}

function makeFileItem(overrides: Partial<ClipboardItemType> = {}): ClipboardItemType {
  return {
    ...makeTextItem(),
    id: 126,
    content_type: 'file',
    content: JSON.stringify(['C:\\Users\\you\\Desktop\\report.pdf']),
    preview: 'report.pdf',
    size: 2048,
    metadata: JSON.stringify({
      file_count: 1,
      dir_count: 0,
      total_size: 2048,
      items: [{ name: 'report.pdf', is_dir: false, size: 2048 }],
    }),
    ...overrides,
  };
}

function makeFolderItem(overrides: Partial<ClipboardItemType> = {}): ClipboardItemType {
  return makeFileItem({
    id: 168,
    content: JSON.stringify(['C:\\Users\\you\\Desktop\\Project']),
    preview: 'Project',
    size: 0,
    metadata: JSON.stringify({
      file_count: 0,
      dir_count: 1,
      total_size: 0,
      items: [{ name: 'Project', is_dir: true, size: 0 }],
    }),
    ...overrides,
  });
}

describe('ClipboardItem', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    storeMocks.copyItem.mockResolvedValue(true);
    storeMocks.copyItemPlainText.mockResolvedValue(true);
    useConfigStore.setState((state) => ({
      config: { ...state.config, mask_sensitive_previews: true },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    storeMocks.deleteItem.mockReset();
    storeMocks.copyItem.mockReset();
    storeMocks.pasteItem.mockReset();
    storeMocks.copyItemPlainText.mockReset();
    storeMocks.pasteItemPlainText.mockReset();
    storeMocks.toggleFavorite.mockReset();
    storeMocks.assignTagToItem.mockReset();
    storeMocks.removeTagFromItem.mockReset();
    storeMocks.toggleSelected.mockReset();
    storeMocks.tags = [];
    storeMocks.selectedIds = [];
    contentActionMocks.actions = [];
    contentActionMocks.executeAction.mockReset();
    contentActionMocks.refresh.mockReset();
  });

  it('requires two clicks to delete (confirmation pattern)', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    const deleteBtn = screen.getByRole('button', { name: '删除' });

    // First click enters confirmation state, does not delete
    fireEvent.click(deleteBtn);
    expect(storeMocks.deleteItem).not.toHaveBeenCalled();

    // Second click confirms deletion
    fireEvent.click(deleteBtn);
    expect(storeMocks.deleteItem).toHaveBeenCalledWith(42);
  });

  it('resets confirmation state after timeout', () => {
    vi.useFakeTimers();
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    const deleteBtn = screen.getByRole('button', { name: '删除' });

    // First click enters confirmation state
    fireEvent.click(deleteBtn);
    expect(storeMocks.deleteItem).not.toHaveBeenCalled();

    // Wait for the 2s timeout to expire
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Now clicking again should NOT delete — it re-enters confirmation
    fireEvent.click(deleteBtn);
    expect(storeMocks.deleteItem).not.toHaveBeenCalled();
  });

  it('toggles favorite on star click', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    const starBtn = screen.getByRole('button', { name: '收藏' });
    fireEvent.click(starBtn);

    expect(storeMocks.toggleFavorite).toHaveBeenCalledWith(42);
  });

  it('assigns and removes tags from the row action menu', () => {
    storeMocks.tags = [
      { id: 1, name: 'Work', color: '#2563eb', created_at: 0 },
      { id: 2, name: 'Later', color: '#16a34a', created_at: 0 },
    ];

    render(
      <ClipboardItem
        item={makeTextItem({
          tags: [{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }],
        })}
        index={1}
        isSelected={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '标签' }));
    fireEvent.click(screen.getByRole('button', { name: '移除 Work' }));
    fireEvent.click(screen.getByRole('button', { name: '添加 Later' }));

    expect(storeMocks.removeTagFromItem).toHaveBeenCalledWith(42, 1);
    expect(storeMocks.assignTagToItem).toHaveBeenCalledWith(42, 2);
  });

  it('masks sensitive text previews by default', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'password=super-secret',
          preview: 'password=super-secret',
          is_sensitive: true,
          sensitivity_reason: 'credential keyword',
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.getByText('已隐藏敏感内容')).toBeTruthy();
    expect(screen.queryByText('password=super-secret')).toBeNull();
  });

  it('exposes full text content on hover without changing the compact row layout', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'a long clipboard value that should remain readable on hover',
          preview: 'a long clipboard value',
        })}
        index={1}
        isSelected={false}
      />
    );

    const preview = screen.getByText('a long clipboard value');

    expect(preview.getAttribute('title')).toBe(
      'a long clipboard value that should remain readable on hover'
    );
    expect(preview.className).toContain('group-hover:text-foreground');
    expect(preview.className).toContain('truncate');
  });

  it('does not leak masked sensitive text through hover titles', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'password=super-secret',
          preview: 'password=super-secret',
          is_sensitive: true,
          sensitivity_reason: 'credential keyword',
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.getByText('已隐藏敏感内容').getAttribute('title')).toBeNull();
  });

  it('prioritizes a custom title and shows a low-noise note indicator', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          custom_title: 'Release checklist',
          note: 'Verify signatures',
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.getByTestId('clipboard-custom-title').textContent).toBe(
      'Release checklist'
    );
    expect(screen.queryByText('hello')).toBeNull();
    expect(screen.getByLabelText('含备注')).toBeTruthy();
  });

  it('does not expose annotations for a masked sensitive item', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          custom_title: 'Secret alias',
          note: 'Secret note',
          is_sensitive: true,
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.queryByText('Secret alias')).toBeNull();
    expect(screen.queryByLabelText('含备注')).toBeNull();
    expect(screen.getByText('已隐藏敏感内容')).toBeTruthy();
  });

  it('renders allowed rich text while stripping executable HTML', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'Safe rich text',
          preview: 'Safe rich text',
          formats: [
            {
              format: 'html',
              content:
                '<b>Safe</b><script>window.__xss = true</script><img src=x onerror="window.__xss = true"><a href="javascript:window.__xss = true" onclick="window.__xss = true">link</a>',
            },
          ],
        })}
        index={1}
        isSelected={false}
      />
    );

    const preview = screen.getByTestId('rich-text-preview');
    expect(preview.querySelector('b')?.textContent).toBe('Safe');
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('[onclick]')).toBeNull();
    expect(preview.querySelector('[onerror]')).toBeNull();
    expect(preview.querySelector('a')?.getAttribute('href')).toBeNull();
  });

  it('falls back to plain text when sanitization removes all HTML', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'Plain fallback',
          preview: 'Plain fallback',
          formats: [{ format: 'html', content: '<script>window.__xss = true</script>' }],
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.queryByTestId('rich-text-preview')).toBeNull();
    expect(screen.getByText('Plain fallback')).toBeTruthy();
  });

  it('shows sensitive text previews when masking is disabled', () => {
    useConfigStore.setState((state) => ({
      config: { ...state.config, mask_sensitive_previews: false },
    }));

    render(
      <ClipboardItem
        item={makeTextItem({
          content: 'password=super-secret',
          preview: 'password=super-secret',
          is_sensitive: true,
          sensitivity_reason: 'credential keyword',
        })}
        index={1}
        isSelected={false}
      />
    );

    expect(screen.getByText('password=super-secret')).toBeTruthy();
    expect(screen.queryByText('已隐藏敏感内容')).toBeNull();
  });

  it('opens image preview from an accessible thumbnail action', () => {
    const onPreview = vi.fn();
    render(
      <ClipboardItem
        item={makeImageItem()}
        index={1}
        isSelected={false}
        onPreview={onPreview}
      />
    );

    const previewButton = screen.getByRole('button', { name: '预览图片' });
    fireEvent.click(previewButton);

    expect(onPreview).toHaveBeenCalledOnce();
  });

  it('shows pending, completed, empty, and failed OCR states on image rows', () => {
    const { rerender } = render(
      <ClipboardItem
        item={makeImageItem({
          ocr: { status: 'pending', text: '', error: null, updated_at: 1 },
        })}
        index={1}
        isSelected={false}
      />
    );
    expect(screen.getByText('正在识别')).toBeTruthy();

    rerender(
      <ClipboardItem
        item={makeImageItem({
          ocr: { status: 'completed', text: '发票号码 2026', error: null, updated_at: 2 },
        })}
        index={1}
        isSelected={false}
      />
    );
    expect(screen.getByText('文字已识别')).toBeTruthy();
    expect(screen.getByText('发票号码 2026')).toBeTruthy();

    rerender(
      <ClipboardItem
        item={makeImageItem({
          ocr: { status: 'completed', text: '', error: null, updated_at: 3 },
        })}
        index={1}
        isSelected={false}
      />
    );
    expect(screen.getByText('未检测到文字')).toBeTruthy();

    rerender(
      <ClipboardItem
        item={makeImageItem({
          ocr: { status: 'failed', text: '', error: 'model error', updated_at: 4 },
        })}
        index={1}
        isSelected={false}
      />
    );
    expect(screen.getByText('识别失败').getAttribute('title')).toBe('model error');
  });

  it('keeps batch selection out of the default item surface', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    expect(screen.queryByRole('checkbox', { name: '选择条目' })).toBeNull();
  });

  it('keeps default text rows neutral and free of numeric index chrome', () => {
    const { container } = render(
      <ClipboardItem item={makeTextItem()} index={7} isSelected={false} />
    );

    const row = container.firstElementChild as HTMLElement;

    expect(screen.queryByText('7')).toBeNull();
    expect(row.className).not.toContain('bg-sky-500');
    expect(row.className).not.toContain('border-l-sky-500');
  });

  it('does not add horizontal margin to the item surface', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    const row = screen.getByText('hello').closest('[data-testid="clipboard-item"]');

    expect(row?.className).not.toContain('mx-1.5');
  });

  it('uses a quiet border treatment for keyboard-selected rows', () => {
    const { container } = render(
      <ClipboardItem item={makeTextItem()} index={1} isSelected />
    );

    const row = container.firstElementChild as HTMLElement;

    expect(row.className).toContain('border-primary/30');
    expect(row.className).not.toContain('shadow-[var(--shadow-card)]');
    expect(row.className).not.toContain('shadow-[var(--shadow-card-glow)]');
    expect(row.className).not.toContain('bg-indigo-500/8');
  });

  it('pastes on row click without showing copy feedback', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByText('hello'));

    expect(storeMocks.pasteItem).toHaveBeenCalledWith(42);
    expect(storeMocks.copyItem).not.toHaveBeenCalled();
    expect(screen.queryByText('已复制')).toBeNull();
  });

  it('uses a readable quiet row treatment after a successful explicit copy', async () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByRole('button', { name: '复制' }));

    const row = screen.getByText('hello').closest('[data-testid="clipboard-item"]');

    expect(storeMocks.copyItem).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
    expect(await screen.findByText('已复制')).toBeTruthy();
    expect(row?.className).toContain('border-primary/35');
    expect(row?.className).toContain('bg-primary/8');
    expect(row?.className).toContain('text-foreground');
    expect(row?.className).not.toContain('bg-indigo-500/8');
  });

  it('does not show copy feedback when the copy action fails', async () => {
    storeMocks.copyItem.mockResolvedValue(false);
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    await act(async () => Promise.resolve());

    expect(storeMocks.copyItem).toHaveBeenCalledWith(42);
    expect(screen.queryByText('已复制')).toBeNull();
  });

  it('offers plain-text copy and paste only for text items', async () => {
    const { rerender } = render(
      <ClipboardItem item={makeTextItem()} index={1} isSelected={false} />
    );

    fireEvent.click(screen.getByRole('button', { name: '复制纯文本' }));
    fireEvent.click(screen.getByRole('button', { name: '粘贴纯文本' }));

    expect(storeMocks.copyItemPlainText).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItemPlainText).toHaveBeenCalledWith(42);
    expect(await screen.findByText('已复制')).toBeTruthy();

    rerender(<ClipboardItem item={makeImageItem()} index={1} isSelected={false} />);
    expect(screen.queryByRole('button', { name: '复制纯文本' })).toBeNull();
    expect(screen.queryByRole('button', { name: '粘贴纯文本' })).toBeNull();
  });

  it('offers the same detail preview entry for every content type', () => {
    const onPreview = vi.fn();
    const { rerender } = render(
      <ClipboardItem
        item={makeTextItem()}
        index={1}
        isSelected={false}
        onPreview={onPreview}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '预览详情' }));
    rerender(
      <ClipboardItem
        item={makeImageItem()}
        index={1}
        isSelected={false}
        onPreview={onPreview}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '预览详情' }));
    rerender(
      <ClipboardItem
        item={makeFileItem()}
        index={1}
        isSelected={false}
        onPreview={onPreview}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '预览详情' }));

    expect(onPreview).toHaveBeenCalledTimes(3);
  });

  it('shows only the primary validated content action on the compact row', () => {
    const action = { kind: 'open_url', target: 'https://example.com' } as const;
    contentActionMocks.actions = [
      action,
      { kind: 'copy_path', target: 'C:\\not-primary.txt' },
    ];
    contentActionMocks.executeAction.mockResolvedValue(undefined);
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByRole('button', { name: '打开链接' }));

    expect(contentActionMocks.executeAction).toHaveBeenCalledWith(action);
    expect(screen.queryByRole('button', { name: '复制路径' })).toBeNull();
  });

  it('uses the same readable quiet row treatment for batch-selected rows', () => {
    storeMocks.selectedIds = [42];

    render(
      <ClipboardItemWithSelection
        item={makeTextItem()}
        index={1}
        isSelected={false}
        selectionMode
      />
    );

    const row = screen.getByText('hello').closest('[data-testid="clipboard-item"]');

    expect(row?.className).toContain('border-primary/35');
    expect(row?.className).toContain('bg-primary/8');
    expect(row?.className).toContain('text-foreground');
    expect(row?.className).not.toContain('bg-indigo-500/8');
  });

  it('floats item actions out of the default content layout', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    const starBtn = screen.getByRole('button', { name: '收藏' });
    const actions = starBtn.parentElement as HTMLElement;

    expect(actions.className).toContain('absolute');
    expect(actions.className).toContain('right-2');
    expect(actions.className).toContain('group-focus-within:opacity-100');
    expect(actions.className).not.toContain('shrink-0');
  });

  it('renders item metadata as a low-noise inline scan line', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          is_sensitive: true,
          sensitivity_reason: 'credential keyword',
          tags: [{ id: 1, name: 'Work', color: '#2563eb', created_at: 0 }],
        })}
        index={1}
        isSelected={false}
      />
    );

    const typeMeta = screen.getByText('文本').parentElement as HTMLElement;
    const sensitiveMeta = screen.getByText('敏感') as HTMLElement;
    const tagMeta = screen.getByText('Work').parentElement as HTMLElement;

    expect(typeMeta.className).toContain('text-muted-foreground');
    expect(typeMeta.className).not.toContain('bg-sky-500');
    expect(typeMeta.className).not.toContain('rounded-sm');
    expect(sensitiveMeta.className).toContain('text-muted-foreground');
    expect(sensitiveMeta.className).not.toContain('text-destructive');
    expect(tagMeta.className).not.toContain('bg-muted');
  });

  it('shows a compact source application with the window title as a tooltip', () => {
    render(
      <ClipboardItem
        item={makeTextItem({
          source_application: 'browser.exe',
          source_window_title: 'Foundation implementation plan',
        })}
        index={1}
        isSelected={false}
      />
    );

    const source = screen.getByTestId('clipboard-source');
    expect(screen.getByText('browser.exe')).toBeTruthy();
    expect(source.getAttribute('title')).toBe(
      'browser.exe - Foundation implementation plan'
    );
  });

  it('omits source metadata when attribution is unavailable', () => {
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    expect(screen.queryByTestId('clipboard-source')).toBeNull();
  });

  it('enables checkbox selection only inside selection mode', () => {
    storeMocks.selectedIds = [42];

    render(
      <ClipboardItemWithSelection
        item={makeTextItem()}
        index={1}
        isSelected={false}
        selectionMode
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: '选择条目' });
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(checkbox);

    expect(storeMocks.toggleSelected).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
  });

  it('uses item clicks for selection instead of copying in selection mode', () => {
    render(
      <ClipboardItemWithSelection
        item={makeTextItem()}
        index={1}
        isSelected={false}
        selectionMode
      />
    );

    fireEvent.click(screen.getByText('hello'));

    expect(storeMocks.toggleSelected).toHaveBeenCalledWith(42);
    expect(storeMocks.pasteItem).not.toHaveBeenCalled();
  });

  it('renders distinct type treatments for text, image, file, and folder entries', () => {
    const { rerender } = render(
      <ClipboardItem item={makeTextItem()} index={1} isSelected={false} />
    );

    expect(screen.getByText('文本')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();

    rerender(<ClipboardItem item={makeImageItem()} index={1} isSelected={false} />);
    expect(screen.getByText('图片')).toBeTruthy();
    expect(screen.getByText('Image 24x24')).toBeTruthy();

    rerender(<ClipboardItem item={makeFileItem()} index={1} isSelected={false} />);
    expect(screen.getByText('文件')).toBeTruthy();
    expect(screen.getByText('report.pdf')).toBeTruthy();

    rerender(<ClipboardItem item={makeFolderItem()} index={1} isSelected={false} />);
    expect(screen.getByText('文件夹')).toBeTruthy();
    expect(screen.getByText('Project')).toBeTruthy();
  });
});
