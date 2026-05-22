/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
});
