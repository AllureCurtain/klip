/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    storeMocks.deleteItem.mockReset();
    storeMocks.copyItem.mockReset();
    storeMocks.toggleFavorite.mockReset();
  });

  it('does not delete when the user cancels confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(confirm).toHaveBeenCalledWith('确定要删除这条剪贴板历史吗？');
    expect(storeMocks.deleteItem).not.toHaveBeenCalled();
  });

  it('deletes when the user confirms', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ClipboardItem item={makeTextItem()} index={1} isSelected={false} />);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(storeMocks.deleteItem).toHaveBeenCalledWith(42);
  });
});
