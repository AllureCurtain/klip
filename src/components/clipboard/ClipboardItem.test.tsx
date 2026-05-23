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
  toggleFavorite: vi.fn(),
  selectedIds: [] as number[],
  toggleSelected: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
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
    is_favorited: false,
    is_sensitive: false,
    sensitivity_reason: null,
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
    storeMocks.toggleFavorite.mockReset();
    storeMocks.toggleSelected.mockReset();
    storeMocks.selectedIds = [];
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
    render(<ClipboardItem item={makeImageItem()} index={1} isSelected={false} />);

    const previewButton = screen.getByRole('button', { name: '预览图片' });
    fireEvent.click(previewButton);

    expect(screen.getByText('图片预览')).toBeTruthy();
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
    expect(storeMocks.copyItem).not.toHaveBeenCalled();
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
    expect(storeMocks.copyItem).not.toHaveBeenCalled();
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
