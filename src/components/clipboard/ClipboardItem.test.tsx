/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardItem } from './ClipboardItem';
import type { ClipboardItem as ClipboardItemType } from '@/types';

const storeMocks = vi.hoisted(() => ({
  deleteItem: vi.fn(),
  copyItem: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('@/stores', () => ({
  useClipboardStore: () => storeMocks,
}));

function makeTextItem(): ClipboardItemType {
  return {
    id: 42,
    content_type: 'text',
    content: 'hello',
    preview: 'hello',
    hash: 'hash-42',
    size: 5,
    metadata: null,
    is_favorited: false,
    created_at: 1_714_000_000_000,
    last_used_at: 1_714_000_000_000,
  };
}

describe('ClipboardItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
